import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Review } from "../models/Review.js";
import { Listing } from "../models/Listing.js";
import { Swap } from "../models/Swap.js";
import { User } from "../models/User.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { signedUrl } from "../config/cloudinary.js";
import { areBlocked } from "../utils/blocked.js";

const router = Router();

const AUTHOR_FIELDS = "username displayName avatar";

function serializeReview(r) {
  const author = r.author;
  return {
    id: String(r._id),
    listing: String(r.listing),
    rating: r.rating,
    comment: r.comment,
    createdAt: r.createdAt,
    author: author
      ? {
          username: author.username,
          name: author.displayName || author.username,
          avatarUrl: author.avatar?.publicId
            ? signedUrl(author.avatar.publicId)
            : (author.avatar?.url ?? null),
        }
      : { username: "", name: "Member", avatarUrl: null },
  };
}

/** Recompute a seller's stored rating from all reviews across their listings. */
async function refreshSellerRating(sellerId) {
  try {
    const agg = await Review.aggregate([
      { $match: { seller: sellerId } },
      { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);
    const row = agg[0];
    await User.updateOne(
      { _id: sellerId },
      { $set: { rating: row ? Math.round(row.avg * 10) / 10 : 0, ratingCount: row ? row.count : 0 } },
    );
  } catch (err) {
    console.error("[reviews] failed to refresh seller rating", err.message);
  }
}

/**
 * Integrity guard: a review is only legitimate after the reviewer actually
 * completed a swap with the seller, where this exact listing changed hands.
 */
function findCompletedSwap(listingId, sellerId, userId) {
  return Swap.findOne({
    status: "completed",
    $or: [
      { requester: userId, owner: sellerId, requestedListing: listingId },
      { requester: userId, owner: sellerId, offeredListing: listingId },
      { requester: sellerId, owner: userId, requestedListing: listingId },
      { requester: sellerId, owner: userId, offeredListing: listingId },
    ],
  });
}

/** GET /api/reviews/listing/:id — reviews for one listing + summary. */
router.get("/reviews/listing/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Not found" });
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Not found" });

    const [reviews, summary, dist] = await Promise.all([
      Review.find({ listing: listing._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("author", AUTHOR_FIELDS),
      Review.aggregate([
        { $match: { listing: listing._id } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } },
      ]),
      Review.aggregate([
        { $match: { listing: listing._id } },
        { $group: { _id: "$rating", count: { $sum: 1 } } },
      ]),
    ]);

    const row = summary[0];
    const byRating = new Map(dist.map((d) => [d._id, d.count]));
    const distribution = Array.from({ length: 5 }, (_, i) => byRating.get(5 - i) ?? 0);
    res.json({
      rating: row ? Math.round(row.avg * 10) / 10 : 0,
      ratingCount: row ? row.count : 0,
      distribution,
      items: reviews.map(serializeReview),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/reviews/user/:username — all reviews for a seller's account. */
router.get("/reviews/user/:username", optionalAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ username: req.params.username, deletedAt: null });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Blocks apply in both directions (same rules as the profile), and private
    // profiles are only reviewable by the owner and admins.
    if (req.user && areBlocked(user, req.user)) {
      return res.status(404).json({ error: "User not found" });
    }
    const isOwner = req.user && String(req.user._id) === String(user._id);
    const isAdmin = req.user?.role === "admin";
    if (user.publicProfile === false && !isOwner && !isAdmin) {
      return res.status(404).json({ error: "User not found" });
    }

    const [reviews, summary] = await Promise.all([
      Review.find({ seller: user._id })
        .sort({ createdAt: -1 })
        .limit(100)
        .populate("author", AUTHOR_FIELDS),
      Review.aggregate([{ $match: { seller: user._id } }, { $group: { _id: "$rating", count: { $sum: 1 } } }]),
    ]);

    const total = summary.reduce((acc, r) => acc + r.count, 0);
    const avg = total ? summary.reduce((acc, r) => acc + r._id * r.count, 0) / total : 0;
    const distribution = Array.from({ length: 5 }, (_, i) => {
      const row = summary.find((s) => s._id === i + 1);
      return row ? row.count : 0;
    });

    res.json({
      rating: total ? Math.round(avg * 10) / 10 : 0,
      ratingCount: total,
      distribution,
      items: reviews.map(serializeReview),
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/reviews/can/:listingId — may the signed-in user review this listing? */
router.get("/reviews/can/:listingId", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.listingId)) return res.status(404).json({ error: "Listing not found" });
    const listing = await Listing.findById(req.params.listingId);
    if (!listing || listing.status === "hidden") return res.status(404).json({ error: "Listing not found" });

    if (String(listing.seller) === String(req.user._id)) {
      return res.json({ canReview: false, reason: "own" });
    }

    const already = await Review.findOne({ listing: listing._id, author: req.user._id });
    if (already) return res.json({ canReview: false, reason: "done" });

    const completedSwap = await findCompletedSwap(listing._id, listing.seller, req.user._id);
    res.json({ canReview: Boolean(completedSwap), reason: completedSwap ? null : "no-swap" });
  } catch (err) {
    next(err);
  }
});

/** POST /api/reviews/listing/:id — authenticated user reviews a listing. */
router.post("/reviews/listing/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    const listing = await Listing.findById(req.params.id);
    if (!listing || listing.status === "hidden") return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) === String(req.user._id)) {
      return res.status(400).json({ error: "You can't review your own listing" });
    }

    // Integrity guard — only completed-swap participants can review.
    const completedSwap = await findCompletedSwap(listing._id, listing.seller, req.user._id);
    if (!completedSwap) {
      return res.status(403).json({
        error: "You can only review an item after completing a swap with the seller.",
      });
    }

    const { rating, comment } = z
      .object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(600).default("") })
      .parse(req.body);

    const existing = await Review.findOne({ listing: listing._id, author: req.user._id });
    if (existing) return res.status(400).json({ error: "You already reviewed this listing" });

    const review = await Review.create({
      listing: listing._id,
      seller: listing.seller,
      author: req.user._id,
      rating,
      comment,
    });
    await review.populate("author", AUTHOR_FIELDS);
    await refreshSellerRating(listing.seller);
    res.status(201).json({ review: serializeReview(review) });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/reviews/:id — the author edits their rating/comment. */
router.patch("/reviews/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Review not found" });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (String(review.author) !== String(req.user._id)) {
      return res.status(403).json({ error: "You can only edit your own review" });
    }

    const { rating, comment } = z
      .object({
        rating: z.number().int().min(1).max(5).optional(),
        comment: z.string().trim().max(600).optional(),
      })
      .parse(req.body);
    if (rating != null) review.rating = rating;
    if (comment != null) review.comment = comment;

    await review.save();
    await review.populate("author", AUTHOR_FIELDS);
    await refreshSellerRating(review.seller);
    res.json({ review: serializeReview(review) });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/reviews/:id — the author removes their review. */
router.delete("/reviews/:id", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Review not found" });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found" });
    if (String(review.author) !== String(req.user._id)) {
      return res.status(403).json({ error: "You can only delete your own review" });
    }

    const sellerId = review.seller;
    await review.deleteOne();
    await refreshSellerRating(sellerId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
