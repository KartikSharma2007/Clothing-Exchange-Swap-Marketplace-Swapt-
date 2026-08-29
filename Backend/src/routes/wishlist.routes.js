import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Wishlist } from "../models/Wishlist.js";
import { Listing } from "../models/Listing.js";
import { signedUrl } from "../config/cloudinary.js";
import { requireAuth } from "../middleware/auth.js";
import { checkAndNotifyMatch } from "../utils/matchmaking.js";

const router = Router();
router.use(requireAuth);

const bagItemSchema = z.object({
  listingId: z.string(),
  // The DB stores ONLY the listing id — these display fields are resolved from
  // the live listing by `serializeWishlist` and never persisted. They used to
  // be REQUIRED, so any client that had just a listing id (e.g. a saved search
  // or a listing card without the full payload) got a 400.
  title: z.string().trim().max(120).optional(),
  image: z.string().url().optional(),
  owner: z.string().trim().optional(),
  ownerId: z.string().nullable().optional(),
  value: z.number().positive().optional(),
  category: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  size: z.string().trim().optional(),
});

async function serializeWishlist(doc) {
  if (!doc) return { items: [] };
  // Populate the listing AND its seller so the Bag can show real owner names.
  const populated = await doc.populate({
    path: "items.listing",
    populate: { path: "seller", select: "username displayName" },
  });
  // Filter out any wishlist items whose listing was deleted (populate -> null)
  const items = (populated.items ?? []).filter((item) => !!item.listing).map((item) => ({
    listingId: String(item.listing._id),
    title: item.listing.title,
    image: signedUrl(item.listing.images[0]?.publicId),
    owner: item.listing.seller?.displayName || item.listing.seller?.username || "Member",
    ownerId: item.listing.seller ? String(item.listing.seller._id) : null,
    value: item.listing.value,
    category: item.listing.category,
    brand: item.listing.brand,
    size: item.listing.size,
    addedAt: item.addedAt ? item.addedAt.toISOString() : null,
  }));
  return { items };
}

/** GET /api/wishlist — fetch user's wishlist */
router.get("/", async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, items: [] });
    }
    const serialized = await serializeWishlist(wishlist);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
});

/** POST /api/wishlist — add item to wishlist */
router.post("/", async (req, res, next) => {
  try {
    const item = bagItemSchema.parse(req.body);
    if (!mongoose.isValidObjectId(item.listingId)) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }

    const listing = await Listing.findById(item.listingId);
    if (!listing) {
      return res.status(404).json({ error: "Listing not found" });
    }
    // Can't save your own listing — that would inflate the "most saved" sort.
    if (String(listing.seller) === String(req.user._id)) {
      return res.status(400).json({ error: "You can't save your own listing" });
    }
    // Swapped/hidden items are no longer available — don't let dead items
    // accumulate in bags (or pad the saves counter).
    if (listing.status !== "active") {
      return res.status(400).json({ error: "This listing is no longer available" });
    }

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, items: [] });
    }

    // Check if already in wishlist
    const exists = wishlist.items.some((i) => String(i.listing) === item.listingId);
    if (!exists) {
      wishlist.items.unshift({ listing: item.listingId });
      // Increment listing saves counter
      await Listing.updateOne({ _id: item.listingId }, { $inc: { saves: 1 } });
      await wishlist.save();
      // A save can complete a mutual swap match — notify both members if so.
      void checkAndNotifyMatch(listing, req.user);
    }

    const serialized = await serializeWishlist(wishlist);
    res.status(201).json(serialized);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/wishlist/:listingId — remove item from wishlist */
router.delete("/:listingId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.listingId)) {
      return res.status(400).json({ error: "Invalid listing ID" });
    }

    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.status(404).json({ error: "Wishlist not found" });
    }

    const initialCount = wishlist.items.length;
    wishlist.items = wishlist.items.filter((i) => String(i.listing) !== req.params.listingId);

    if (wishlist.items.length < initialCount) {
      // Decrement listing saves counter — floored at 0 via a pipeline update.
      // A plain `$inc: -1` could drive the counter negative when the removal
      // races a re-save or follows a drifted count (the display-only API used
      // to let saves and wishlists drift apart).
      await Listing.updateOne(
        { _id: req.params.listingId },
        [{ $set: { saves: { $max: [{ $add: ["$saves", -1] }, 0] } } }],
      );
      await wishlist.save();
    }

    const serialized = await serializeWishlist(wishlist);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/wishlist — clear all items */
router.delete("/", async (req, res, next) => {
  try {
    const wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      return res.json({ items: [] });
    }

    // Decrement all listing saves counters (floored at 0 — see the single-remove route)
    if (wishlist.items.length > 0) {
      await Listing.updateMany(
        { _id: { $in: wishlist.items.map((i) => i.listing) } },
        [{ $set: { saves: { $max: [{ $add: ["$saves", -1] }, 0] } } }],
      );
    }

    wishlist.items = [];
    await wishlist.save();

    res.json({ items: [] });
  } catch (err) {
    next(err);
  }
});

/** POST /api/wishlist/merge — merge guest bag into account */
router.post("/merge", async (req, res, next) => {
  try {
    const { items: guestItems } = z.object({ items: z.array(z.object({ listingId: z.string() })) }).parse(req.body);

    let wishlist = await Wishlist.findOne({ user: req.user._id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: req.user._id, items: [] });
    }

    const existingIds = new Set(wishlist.items.map((i) => String(i.listing)));
    const toAdd = [];
    const listingIds = [];

    // Skip items that are no longer active or belong to the user themselves —
    // same guards as the single-save endpoint.
    const validListings = await Listing.find({
      _id: { $in: guestItems.map((g) => g.listingId).filter(mongoose.isValidObjectId) },
      status: "active",
      seller: { $ne: req.user._id },
    }).select("_id");

    for (const guestItem of guestItems) {
      if (!mongoose.isValidObjectId(guestItem.listingId)) continue;
      if (!existingIds.has(guestItem.listingId) && validListings.some((l) => String(l._id) === guestItem.listingId)) {
        toAdd.push({ listing: guestItem.listingId });
        listingIds.push(new mongoose.Types.ObjectId(guestItem.listingId));
      }
    }

    if (toAdd.length > 0) {
      wishlist.items.unshift(...toAdd);
      await Listing.updateMany({ _id: { $in: listingIds } }, { $inc: { saves: 1 } });
      await wishlist.save();
    }

    const serialized = await serializeWishlist(wishlist);
    res.json(serialized);
  } catch (err) {
    next(err);
  }
});

export default router;
