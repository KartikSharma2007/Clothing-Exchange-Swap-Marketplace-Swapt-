import crypto from "crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { Listing } from "../models/Listing.js";
import { Swap } from "../models/Swap.js";
import { Message } from "../models/Message.js";
import { Conversation, conversationPairKey } from "../models/Conversation.js";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Report, REPORT_REASONS } from "../models/Report.js";
import { Dispute, DISPUTE_REASONS } from "../models/Dispute.js";
import { SavedSearch } from "../models/SavedSearch.js";
import { PushSubscription } from "../models/PushSubscription.js";
import { recordAudit } from "../models/AuditLog.js";
import { Payment } from "../models/Payment.js";
import { emailEnabled, sendPhoneCodeEmail, sendSwapRequestEmail, sendSwapAcceptedEmail, sendSwapStatusEmail, sendCounterOfferEmail, sendMeetupUpdatedEmail, sendTrackingAddedEmail, sendReceiptConfirmedEmail, sendSwapExpiredEmail, sendDisputeOpenedEmail, sendReportReceivedEmail } from "../utils/email.js";
import { smsEnabled, sendPhoneVerificationSMS } from "../utils/sms.js";
import { signedUrl, uploadBuffer, signEvidenceUrl } from "../config/cloudinary.js";
import { upload, uploadCsv, validateImageUpload } from "../middleware/upload.js";
import { publishSwap } from "../ws.js";
import { recomputeReliability } from "../utils/reliability.js";
import { notify } from "../utils/notify.js";
import { pushToUser } from "../utils/push.js";
import { savedSearchSchema, addressSchema, updateAddressSchema } from "../utils/validators.js";
import { listingSchema, toListingDoc } from "../utils/validators.js";
import { findMutualMatches } from "../utils/matchmaking.js";
import { escrowHold, settleEscrow, escrowForSwap, escrowRefund, netCreditsForSwap } from "../utils/escrow.js";
import { parseCsv, toCsv } from "../utils/csv.js";
import { fetchPublicImage } from "../utils/safe-fetch.js";
import { Follow } from "../models/Follow.js";
import { areBlocked } from "../utils/blocked.js";

const router = Router();
router.use(requireAuth);

function listingCard(doc) {
  if (!doc) return null;
  const effectiveFeatured = doc.featured ? (!doc.featuredUntil || new Date(doc.featuredUntil).getTime() > Date.now()) : false;
  return {
    id: String(doc._id),
    title: doc.title,
    brand: doc.brand,
    category: doc.category,
    size: doc.size,
    value: doc.value,
    status: doc.status,
    featured: Boolean(effectiveFeatured),
    featuredUntil: doc.featuredUntil ? new Date(doc.featuredUntil).toISOString() : null,
    images: (doc.images ?? []).map((i) => signedUrl(i.publicId)),
    createdAt: doc.createdAt,
    meetup: Boolean(doc.meetup),
    lat: doc.locationCoord?.coordinates?.[1] ?? undefined,
    lng: doc.locationCoord?.coordinates?.[0] ?? undefined,
    returnWindowDays: doc.returnWindowDays ?? 7,
    returnPolicy: doc.returnPolicy ?? "",
    moderationStatus: doc.moderationStatus ?? "approved",
  };
}

/** Shape a swap for the signed-in member (direction is relative to them). */
function serializeSwap(s, userId, unreadCount = 0, dispute = null, escrow = null) {
  const outgoing = String(s.requester?._id ?? s.requester) === String(userId);
  const other = outgoing ? s.owner : s.requester;
  return {
    id: String(s._id),
    conversationId: s.conversation ? String(s.conversation._id ?? s.conversation) : null,
    counterpartyId: other?._id ? String(other._id) : null,
    direction: outgoing ? "outgoing" : "incoming",
    status: s.status,
    message: s.message,
    unreadCount,
    dispute: dispute
      ? {
          id: String(dispute._id),
          reason: dispute.reason,
          description: dispute.description,
          status: dispute.status,
          resolutionNote: dispute.resolutionNote,
          outcome: dispute.outcome,
        }
      : null,
    escrow: escrow
      ? { amount: escrow.amount, status: escrow.status, receiptNo: escrow.receiptNo }
      : null,
    counterparty: {
      username: other?.username ?? "",
      name: other?.displayName || other?.username || "Member",
      avatarUrl: other?.avatar?.publicId ? signedUrl(other.avatar.publicId) : (other?.avatar?.url ?? null),
    },
    requestedListing: listingCard(s.requestedListing),
    requestedValue: s.requestedValue ?? (s.requestedListing?.value ?? null),
    offeredListing: listingCard(s.offeredListing),
    offeredValue: s.offeredValue ?? (Array.isArray(s.offeredListings) && s.offeredListings.length
      ? s.offeredListings.reduce((total, item) => total + (Number(item?.value ?? 0) || 0), 0)
      : (s.offeredListing ? Number(s.offeredListing.value ?? 0) || 0 : 0)),
    offeredListings: Array.isArray(s.offeredListings) ? s.offeredListings.map(listingCard).filter(Boolean) : [],
    offeredBundle: Array.isArray(s.offeredListings) && s.offeredListings.length ? s.offeredListings.map(listingCard).filter(Boolean) : (s.offeredListing ? [listingCard(s.offeredListing)] : []),
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    meetup: Boolean(s.meetup),
    meetupPlace: s.meetupPlace || "",
    meetupTime: s.meetupTime ? s.meetupTime.toISOString() : null,
    meetupLat: s.meetupLat ?? null,
    meetupLng: s.meetupLng ?? null,
    shipping: Boolean(s.shipping),
    carrier: s.carrier || "",
    trackingNumber: s.trackingNumber || "",
    shippingStatus: s.shippingStatus || null,
    labelUrl: s.labelUrl || "",
    shippingAddress: s.shippingAddress ? {
      label: s.shippingAddress.label ?? "",
      name: s.shippingAddress.name ?? "",
      line1: s.shippingAddress.line1 ?? "",
      line2: s.shippingAddress.line2 ?? "",
      city: s.shippingAddress.city ?? "",
      postal: s.shippingAddress.postal ?? "",
      country: s.shippingAddress.country ?? "",
      phone: s.shippingAddress.phone ?? "",
    } : null,
    expiresAt: s.expiresAt ? s.expiresAt.toISOString() : null,
    counteredAt: s.counteredAt ? s.counteredAt.toISOString() : null,
    receiptConfirmedAt: s.receiptConfirmedAt ? s.receiptConfirmedAt.toISOString() : null,
  };
}

function serializeMessage(m, userId) {
  return {
    id: String(m._id),
    kind: m.kind,
    body: m.body,
    // Re-sign the Cloudinary URL each fetch so image messages never expire.
    image: m.image ? (m.image.startsWith("http") ? m.image : signedUrl(m.image)) : null,
    author: m.senderUsername,
    mine: Boolean(m.sender) && String(m.sender) === String(userId),
    readAt: m.readAt ? new Date(m.readAt).toISOString() : null,
    createdAt: m.createdAt,
  };
}


const swapPopulate = (query) =>
  query
    .populate("requester", "username displayName avatar")
    .populate("owner", "username displayName avatar")
    .populate("requestedListing", "title brand images value status featured category size createdAt returnWindowDays returnPolicy moderationStatus")
    .populate("offeredListing", "title brand images value status featured category size createdAt returnWindowDays returnPolicy moderationStatus")
    .populate("offeredListings", "title brand images value status featured category size createdAt returnWindowDays returnPolicy moderationStatus");

/** Load a swap the signed-in member is part of, or respond 404/403. */
async function loadSwapForUser(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Swap not found" });
    return null;
  }
  const swap = await swapPopulate(Swap.findById(req.params.id));
  if (!swap) {
    res.status(404).json({ error: "Swap not found" });
    return null;
  }
  const mine =
    String(swap.requester?._id ?? swap.requester) === String(req.user._id) ||
    String(swap.owner?._id ?? swap.owner) === String(req.user._id);
  if (!mine) {
    res.status(403).json({ error: "Not your swap" });
    return null;
  }
  // Ensure older swaps have a conversation so chat threads stay continuous.
  if (!swap.conversation) {
    const conv = await conversationBetween(swap.requester?._id ?? swap.requester, swap.owner?._id ?? swap.owner);
    swap.conversation = conv._id;
    await swap.save();
    await Message.updateMany({ swap: swap._id, conversation: null }, { $set: { conversation: conv._id } });
  }
  return swap;
}

/**
 * Find (or create) the shared conversation between two members. Uniqueness is
 * enforced via `pairKey` (sorted ids) — the old unique index on the `members`
 * array was a multikey index that silently locked every member into at most
 * one conversation, which broke messaging/swapping platform-wide.
 */
async function conversationBetween(a, b) {
  const pairKey = conversationPairKey(a, b);
  const members = pairKey.split(":");
  let conv = await Conversation.findOne({ pairKey });
  if (!conv) {
    try {
      conv = await Conversation.create({ members, pairKey });
    } catch (err) {
      // A concurrent request may have won the race — reuse their conversation.
      if (err?.code === 11000) conv = await Conversation.findOne({ pairKey });
      else throw err;
    }
  }
  return conv;
}

/** Send a realtime event to every swap sharing a conversation. */
async function publishConversation(convId, event) {
  try {
    const swaps = await Swap.find({ conversation: convId }).select("_id requester owner").lean();
    for (const s of swaps) publishSwap(s, event);
  } catch (err) {
    console.error("[swap] publishConversation failed", err.message);
  }
}

/**
 * Mark the items exchanged in a completed swap as consumed. Decrements each
 * listing's quantity (and its committed reservation) and sets status "swapped"
 * once quantity reaches zero so the item stops appearing on browse / being
 * requestable. Runs inside the swap transaction so consumption and escrow
 * commit (or roll back) together.
 */
export async function consumeListings(swap, opts = {}) {
  const { session } = opts;
  const ids = swapListingIds(swap);
  // Atomic pipeline — safe even without a transaction (Atlas M0 fallback): quantity/committed never go negative and status flips to swapped exactly when quantity hits 0
  await Promise.all(
    ids.map((id) =>
      Listing.updateOne(
        { _id: id },
        [
          {
            $set: {
              quantity: { $max: [{ $subtract: [{ $ifNull: ["$quantity", 1] }, 1] }, 0] },
              committedQuantity: { $max: [{ $subtract: [{ $ifNull: ["$committedQuantity", 0] }, 1] }, 0] },
            },
          },
          { $set: { status: { $cond: [{ $eq: ["$quantity", 0] }, "swapped", "$status"] } } },
        ],
        { session: session ?? null },
      ),
    ),
  );
}

/** The listing ids exchanged by a swap (deduplicated). Handles bundle (offeredListings[]) + legacy single. */
function swapListingIds(swap) {
  const requestedId = swap.requestedListing?._id ?? swap.requestedListing;
  const offeredIds = (() => {
    const arr = Array.isArray(swap.offeredListings) ? swap.offeredListings : [];
    const legacy = swap.offeredListing?._id ?? swap.offeredListing;
    const all = [...arr.map((x) => x?._id ?? x), ...(legacy ? [legacy] : [])].filter(Boolean).map(String);
    // dedupe
    return [...new Set(all)];
  })();
  if (!requestedId && !offeredIds.length) return [];
  if (!requestedId) return offeredIds;
  const reqStr = String(requestedId);
  const filtered = offeredIds.filter((id) => id !== reqStr);
  return filtered.length ? [reqStr, ...filtered] : [reqStr];
}

/**
 * Atomically reserve one unit of each listing exchanged by this swap (called
 * on accept). `findOneAndUpdate` serialises concurrent reservations on the
 * listing document, so the returned `committedQuantity` is accurate even
 * without a wrapping transaction — a second accept of the same unit loses the
 * atomic increment and is refused. Throws 409 when an item is no longer
 * available or already fully claimed.
 *
 * `committed` (optional) collects the ids actually reserved so the caller can
 * roll exactly those back if a later step in the accept fails.
 */
async function commitListings(swap, opts = {}) {
  const { session, committed = [] } = opts;
  for (const id of swapListingIds(swap)) {
    const listing = await Listing.findOneAndUpdate(
      { _id: id, status: "active" },
      { $inc: { committedQuantity: 1 } },
      { new: true, session: session ?? null },
    );
    if (!listing) throw httpError(409, "An item in this swap is no longer available.");
    // Recorded before the capacity check so a failed accept can release it.
    committed.push(String(id));
    if (listing.committedQuantity > (listing.quantity ?? 1)) {
      throw httpError(409, "An item in this swap has already been claimed by another accepted swap.");
    }
  }
}

/** Release one reserved unit of the given listing ids (floor 0). */
async function releaseListingIds(ids, opts = {}) {
  const { session } = opts;
  for (const id of ids) {
    await Listing.updateOne(
      { _id: id },
      [
        {
          $set: {
            committedQuantity: {
              $max: [{ $subtract: [{ $ifNull: ["$committedQuantity", 0] }, 1] }, 0],
            },
          },
        },
      ],
      { session: session ?? null },
    );
  }
}

/** Release the units reserved by a swap (on decline/cancel). */
export async function releaseListings(swap, opts = {}) {
  return releaseListingIds(swapListingIds(swap), opts);
}

/** Append a system note to the transcript. Never throws into the request path. */
async function systemNote(swapId, body) {
  try {
    const swap = await Swap.findById(swapId).select("conversation");
    await Message.create({
      swap: swapId,
      conversation: swap?.conversation ?? null,
      kind: "system",
      body,
    });
  } catch (err) {
    console.error("[swap] failed to log system note", err.message);
  }
}

/** GET /api/me/listings — everything the signed-in member has posted. */
router.get("/listings", async (req, res, next) => {
  try {
    const items = await Listing.find({ seller: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ items: items.map(listingCard) });
  } catch (err) { next(err); }
});

/** GET /api/me/analytics — seller analytics for the dashboard */
router.get("/analytics", async (req, res, next) => {
  try {
    const listings = await Listing.find({ seller: req.user._id }).lean();
    const swaps = await Swap.find({ $or: [{ requester: req.user._id }, { owner: req.user._id }] }).lean();
    const totalViews = listings.reduce((s, l) => s + (l.views || 0), 0);
    const totalSaves = listings.reduce((s, l) => s + (l.saves || 0), 0);
    const active = listings.filter((l) => l.status === "active").length;
    const swapped = listings.filter((l) => l.status === "swapped").length;
    const hidden = listings.filter((l) => l.status === "hidden").length;
    const pendingSwaps = swaps.filter((s) => s.status === "pending").length;
    const completedSwaps = swaps.filter((s) => s.status === "completed").length;
    const topListings = [...listings].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 3).map((l) => ({
      id: String(l._id), title: l.title, views: l.views || 0, saves: l.saves || 0, value: l.value,
      image: l.images?.[0] ? signedUrl(l.images[0].publicId) : null,
    }));
    res.json({ totalViews, totalSaves, active, swapped, hidden, totalListings: listings.length, pendingSwaps, completedSwaps, totalSwaps: swaps.length, topListings });
  } catch (err) { next(err); }
});

/** GET /api/me/following — users you follow */
router.get("/following", async (req, res, next) => {
  try {
    const follows = await Follow.find({ follower: req.user._id }).populate("following", "username displayName avatar");
    const users = follows.map((f) => {
      const u = f.following;
      return u ? { username: u.username, displayName: u.displayName || u.username, avatarUrl: u.avatar?.publicId ? signedUrl(u.avatar.publicId) : u.avatar?.url ?? null } : null;
    }).filter(Boolean);
    res.json({ users });
  } catch (err) { next(err); }
});

/** GET /api/me/followers — members who follow you */
router.get("/followers", async (req, res, next) => {
  try {
    const follows = await Follow.find({ following: req.user._id }).populate("follower", "username displayName avatar");
    const users = follows.map((f) => {
      const u = f.follower;
      return u ? { username: u.username, displayName: u.displayName || u.username, avatarUrl: u.avatar?.publicId ? signedUrl(u.avatar.publicId) : u.avatar?.url ?? null } : null;
    }).filter(Boolean);
    res.json({ users });
  } catch (err) { next(err); }
});

/** DELETE /api/me/followers/:username — remove a member from your followers */
router.delete("/followers/:username", async (req, res, next) => {
  try {
    const follower = await User.findOne({ username: String(req.params.username || "").trim(), deletedAt: null }).select("_id");
    if (!follower) return res.status(404).json({ error: "User not found" });
    await Follow.deleteOne({ follower: follower._id, following: req.user._id });
    res.json({ removed: true });
  } catch (err) { next(err); }
});

/** GET /api/me/following/feed — listings from followed sellers */
router.get("/following/feed", async (req, res, next) => {
  try {
    const follows = await Follow.find({ follower: req.user._id }).select("following");
    const ids = follows.map((f) => f.following);
    if (!ids.length) return res.json({ items: [] });
    const items = await Listing.find({ seller: { $in: ids }, status: "active" }).sort({ createdAt: -1 }).limit(20).populate("seller", "username displayName avatar");
    const serialize = (doc) => ({
      id: String(doc._id), title: doc.title, brand: doc.brand, category: doc.category, size: doc.size, value: doc.value,
      images: (doc.images ?? []).map((i) => signedUrl(i.publicId)),
      seller: doc.seller ? { username: doc.seller.username, name: doc.seller.displayName || doc.seller.username, avatarUrl: doc.seller.avatar?.publicId ? signedUrl(doc.seller.avatar.publicId) : doc.seller.avatar?.url ?? null } : null,
      createdAt: doc.createdAt, views: doc.views || 0, saves: doc.saves || 0,
    });
    res.json({ items: items.map(serialize) });
  } catch (err) { next(err); }
});

/** GET /api/me/watches — your price/restock watches */
router.get("/watches", async (req, res, next) => {
  try {
    const { Watch } = await import("../models/Watch.js");
    const watches = await Watch.find({ user: req.user._id }).populate("listing", "title brand images value status");
    const out = watches.map((w) => ({
      id: String(w._id),
      listing: w.listing ? { id: String(w.listing._id), title: w.listing.title, brand: w.listing.brand, value: w.listing.value, status: w.listing.status, image: w.listing.images?.[0] ? signedUrl(w.listing.images[0].publicId) : null } : null,
      lastValue: w.lastValue,
      createdAt: w.createdAt,
    })).filter((x) => x.listing);
    res.json({ items: out });
  } catch (err) { next(err); }
});

const CSV_COLUMNS = [
  "title", "brand", "description", "category", "gender", "size", "condition", "color", "value",
  "location", "meetup", "retailValue", "material", "fit", "style", "pattern", "season", "care",
  "shippingDays", "swapPreferences", "quantity", "tags", "chest", "waist", "hips", "length",
  "inseam", "shoulder", "sleeve", "image1", "image2", "image3",
];

const CSV_HEADERS = ["id", ...CSV_COLUMNS, "status", "createdAt"];

/** GET /api/me/listings/export.csv — full dump of the member's listings as CSV. */
router.get("/listings/export.csv", async (req, res, next) => {
  try {
    const items = await Listing.find({ seller: req.user._id }).sort({ createdAt: -1 }).limit(1000);
    const rows = items.map((l) => [
      String(l._id),
      l.title, l.brand, l.description, l.category, l.gender, l.size, l.condition, l.color, l.value,
      l.location, l.meetup ? "true" : "false", l.retailValue ?? "", l.material, l.fit, l.style,
      l.pattern, l.season, l.care, l.shippingDays, l.swapPreferences, l.quantity,
      (l.tags ?? []).join(","),
      l.measurements?.chest ?? "", l.measurements?.waist ?? "", l.measurements?.hips ?? "",
      l.measurements?.length ?? "", l.measurements?.inseam ?? "", l.measurements?.shoulder ?? "",
      l.measurements?.sleeve ?? "",
      l.images?.[0]?.publicId ?? "", l.images?.[1]?.publicId ?? "", l.images?.[2]?.publicId ?? "",
      l.status, l.createdAt ? new Date(l.createdAt).toISOString() : "",
    ]);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="swapt-listings.csv"`);
    res.send(toCsv(CSV_HEADERS, rows));
  } catch (err) { next(err); }
});

/**
 * POST /api/me/listings/import — bulk-create listings from an uploaded .csv file.
 * Columns mirror CSV_COLUMNS above; image1..image3 are public image URLs
 * (fetched + uploaded to Cloudinary). Returns per-row results.
 */
router.post("/listings/import", uploadCsv, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Upload a .csv file" });
    const text = req.file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    const rows = parseCsv(text);
    if (rows.length < 2) return res.status(400).json({ error: "CSV needs a header row and at least one listing" });

    const header = rows[0].map((h) => String(h).trim());
    const toRecord = (row) => Object.fromEntries(header.map((h, i) => [h, (row[i] ?? "").trim()]));

    const imported = [];
    const errors = [];
    const MAX_ROWS = 200;

    for (let i = 1; i < rows.length && i <= MAX_ROWS; i++) {
      const raw = toRecord(rows[i]);
      const { image1, image2, image3, ...rest } = raw;
      try {
        if (!rest.title && !rest.brand) throw new Error("Row is empty");
        if (rest.meetup) rest.meetup = ["true", "1", "yes"].includes(String(rest.meetup).toLowerCase());
        const data = listingSchema.parse(rest);
        const imageUrls = [image1, image2, image3].map((u) => String(u || "").trim()).filter(Boolean);
        if (!imageUrls.length) throw new Error("image1 column (a public image URL) is required");

        const uploaded = [];
        for (const url of imageUrls.slice(0, 3)) {
          // SSRF guard: only public http(s) hosts are fetched, every redirect
          // hop is re-validated, and private/loopback/link-local addresses are
          // rejected (a CSV must never be able to reach internal hosts).
          const { buffer: buf } = await fetchPublicImage(url);
          const result = await uploadBuffer(buf);
          uploaded.push({ publicId: result.public_id, width: result.width ?? null, height: result.height ?? null, bytes: result.bytes ?? null });
        }

        const listing = await Listing.create({ ...toListingDoc(data), images: uploaded, seller: req.user._id });
        imported.push(String(listing._id));
      } catch (err) {
        errors.push({ row: i + 1, reason: err.issues ? err.issues.map((x) => x.message).join("; ") : err.message });
      }
    }

    res.status(201).json({ imported: imported.length, failed: errors.length, errors, ids: imported });
  } catch (err) { next(err); }
});

/** GET /api/me/swap-matches — suggested mutual swaps (never auto-created). */
router.get("/swap-matches", async (req, res, next) => {
  try {
    const matches = await findMutualMatches(req.user._id);
    res.json({ matches, count: matches.length });
  } catch (err) { next(err); }
});

/** GET /api/me/swaps — swap history in both directions, with unread counts.
 *  Cursor-paginated so accounts with many swaps don't load everything at once. */
router.get("/swaps", async (req, res, next) => {
  try {
    const { cursor, limit } = z
      .object({
        cursor: z.string().refine(mongoose.isValidObjectId, "Invalid cursor").optional(),
        limit: z.coerce.number().int().min(1).max(50).optional().default(20),
      })
      .parse(req.query);

    const filter = { $or: [{ requester: req.user._id }, { owner: req.user._id }] };
    if (cursor) filter._id = { $lt: new mongoose.Types.ObjectId(cursor) };

    // Previously swaps with a blocked counterparty or a deleted thread were hard-hidden from history — that
    // made the inbox look empty even though the swap still exists and is reachable via direct URL.
    // We now keep swaps visible and let the frontend badge them, so "no swaps" only shows when you truly have none.
    // To restore hard-hide, uncomment the blocks below.
    // const blockedViewer = await User.find({ blockedUsers: req.user._id }).select("_id");
    // const blockedIds = [...(req.user.blockedUsers || []), ...blockedViewer.map((u) => u._id)];
    // if (blockedIds.length) {
    //   filter.requester = { $nin: blockedIds };
    //   filter.owner = { $nin: blockedIds };
    // }
    // const hiddenConvs = await Conversation.find({ members: req.user._id, hiddenFor: req.user._id }).select("_id");
    // if (hiddenConvs.length) {
    //   filter.conversation = { $nin: hiddenConvs.map((c) => c._id) };
    // }

    const page = await swapPopulate(
      Swap.find(filter).sort({ _id: -1 }).limit(limit + 1),
    );
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;

    const unread = await Message.aggregate([
      {
        $match: {
          swap: { $in: slice.map((s) => s._id) },
          sender: { $ne: req.user._id },
          readAt: null,
        },
      },
      { $group: { _id: "$swap", count: { $sum: 1 } } },
    ]);
    const unreadBySwap = new Map(unread.map((u) => [String(u._id), u.count]));

    const holds = await Payment.find({
      swap: { $in: slice.map((s) => s._id) },
      type: "escrow_hold",
      status: "pending",
    }).select("amount status receiptNo swap").lean();
    const holdBySwap = new Map(holds.map((h) => [String(h.swap), h]));

    res.json({
      items: slice.map((s) => serializeSwap(s, req.user._id, unreadBySwap.get(String(s._id)) ?? 0, null, holdBySwap.get(String(s._id)) ?? null)),
      hasMore,
      nextCursor: hasMore ? String(slice[slice.length - 1]._id) : null,
    });
  } catch (err) { next(err); }
});


/** POST /api/me/swaps — propose a swap for someone else's listing. */
router.post("/swaps", async (req, res, next) => {
  try {
    const data = z
      .object({
        requestedListing: z.string().refine(mongoose.isValidObjectId, "Invalid listing"),
        offeredListing: z.string().refine(mongoose.isValidObjectId, "Invalid listing").optional(),
        offeredListings: z.array(z.string().refine(mongoose.isValidObjectId, "Invalid listing")).max(3).optional(),
        message: z.string().trim().max(500).optional().default(""),
        meetup: z.coerce.boolean().optional().default(false),
        meetupPlace: z.string().trim().max(160).optional().default(""),
        meetupLat: z.number().min(-90).max(90).optional().nullable(),
        meetupLng: z.number().min(-180).max(180).optional().nullable(),
        shipping: z.coerce.boolean().optional().default(false),
        carrier: z.string().trim().max(40).optional().default(""),
        shippingAddressId: z.string().refine(mongoose.isValidObjectId, "Invalid address").optional(),
        shippingAddress: z.object({
          label: z.string().trim().max(40).optional(),
          name: z.string().trim().max(80).optional(),
          line1: z.string().trim().max(120).optional(),
          line2: z.string().trim().max(120).optional(),
          city: z.string().trim().max(80).optional(),
          postal: z.string().trim().max(20).optional(),
          country: z.string().trim().max(60).optional(),
          phone: z.string().trim().max(24).optional(),
        }).optional(),
      })
      .parse(req.body);

    // A swap with neither meetup nor shipping can never complete — completion
    // requires a confirmed meetup or a tracking number, both of which are
    // gated on their respective flag. Refuse it up front so credits can't be
    // trapped in a dead swap.
    if (!data.meetup && !data.shipping) {
      return res.status(400).json({ error: "Choose a delivery method for this swap — a local meetup or shipping." });
    }

    const target = await Listing.findById(data.requestedListing);
    if (!target || target.status !== "active") return res.status(404).json({ error: "Listing not available" });
    if (String(target.seller) === String(req.user._id)) return res.status(400).json({ error: "That's your own listing" });

    // Prevent proposing a swap if either member has blocked the other — a
    // block is enforced in both directions (the blockee can't come back either).
    const owner = await User.findById(target.seller).select("blockedUsers username email accent");
    if (owner && areBlocked(owner, req.user)) {
      return res.status(403).json({ error: "You cannot contact this member" });
    }

    // Normalize bundle: support both single offeredListing (legacy) and offeredListings[] (2-3 items)
    const bundleIds = (() => {
      const arr = Array.isArray(data.offeredListings) ? data.offeredListings : [];
      const single = data.offeredListing ? [data.offeredListing] : [];
      const merged = [...arr, ...single].filter(Boolean);
      return [...new Set(merged)]; // dedupe
    })();
    if (bundleIds.length > 3) return res.status(400).json({ error: "You can offer up to 3 items in a bundle." });

    let offeredValue = 0;
    const bundleDocs = [];
    if (bundleIds.length) {
      for (const oid of bundleIds) {
        const offered = await Listing.findById(oid);
        if (!offered || String(offered.seller) !== String(req.user._id)) {
          return res.status(400).json({ error: "You can only offer your own listings" });
        }
        if (offered.status !== "active") {
          return res.status(400).json({ error: `“${offered.title}” isn't available for swapping right now.` });
        }
        if (String(offered._id) === String(target._id)) {
          return res.status(400).json({ error: "You can't swap an item for itself." });
        }
        bundleDocs.push(offered);
        offeredValue += offered.value ?? 0;
      }
    }

    // Resolve shipping address snapshot for shipping swaps (multiple saved addresses)
    let shippingAddressSnap = null;
    if (data.shipping && !data.meetup) {
      const meFull = await User.findById(req.user._id).select("shippingAddresses shippingProfile");
      if (data.shippingAddressId) {
        const addr = meFull.shippingAddresses?.id?.(data.shippingAddressId);
        if (addr) {
          shippingAddressSnap = { label: addr.label, name: addr.name, line1: addr.line1, line2: addr.line2, city: addr.city, postal: addr.postal, country: addr.country, phone: addr.phone };
        }
        // else: the referenced address no longer exists (e.g. deleted between
        // page load and submit) — fall through to the default-address logic
        // below instead of silently creating a shipping swap with no address.
      }
      if (!shippingAddressSnap && data.shippingAddress && data.shippingAddress.line1) {
        shippingAddressSnap = data.shippingAddress;
      } else if (!shippingAddressSnap) {
        // Fallback to default saved address or legacy profile
        const def = meFull.shippingAddresses?.find((a) => a.isDefault) ?? meFull.shippingAddresses?.[0];
        if (def) shippingAddressSnap = { label: def.label, name: def.name, line1: def.line1, line2: def.line2, city: def.city, postal: def.postal, country: def.country, phone: def.phone };
        else if (meFull.shippingProfile?.line1) {
          const p = meFull.shippingProfile;
          shippingAddressSnap = { label: "Default", name: p.name, line1: p.line1, line2: p.line2, city: p.city, postal: p.postal, country: p.country, phone: p.phone };
        }
      }
    }

    // One conversation per member pair — a new request for a different item
    // continues the same chat thread as previous swaps.
    const conv = await conversationBetween(req.user._id, target.seller);

    const swap = await Swap.create({
      requester: req.user._id,
      owner: target.seller,
      conversation: conv._id,
      requestedListing: target._id,
      // Snapshot the agreed values now so escrow can't be moved by a listing
      // edit later in the negotiation.
      requestedValue: target.value ?? 0,
      offeredValue: bundleIds.length ? offeredValue : null,
      offeredListing: bundleDocs[0]?._id ?? null,
      offeredListings: bundleIds,
      message: data.message,
      meetup: data.meetup,
      meetupPlace: data.meetup ? data.meetupPlace : "",
      meetupLat: data.meetup ? (data.meetupLat ?? null) : null,
      meetupLng: data.meetup ? (data.meetupLng ?? null) : null,
      shipping: data.shipping && !data.meetup,
      carrier: data.shipping && !data.meetup ? data.carrier : "",
      shippingStatus: data.shipping && !data.meetup ? "awaiting_shipment" : null,
      shippingAddress: shippingAddressSnap ?? undefined,
      // Unanswered requests self-cancel after a week (see the expiry sweeper).
      expiresAt: new Date(Date.now() + SWAP_EXPIRY_MS),
    });

    await systemNote(swap._id, `${req.user.username} proposed a swap for “${target.title}”.`);
    if (data.message) {
      await Message.create({
        swap: swap._id,
        conversation: conv._id,
        sender: req.user._id,
        senderUsername: req.user.username,
        kind: "text",
        body: data.message,
      });
    }
    await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessageAt: new Date() } });

    // Let the listing owner know a request came in (also pushed to their devices).
    const ok = await notify(target.seller, {
      kind: "swap_request",
      title: "New swap request",
      body: `${req.user.displayName || req.user.username} wants “${target.title}”.`,
      href: `/swaps/${swap._id}`,
      actor: req.user._id,
    });
    if (ok) void pushToUser(target.seller, {
      title: "Swapt · New swap request",
      body: `${req.user.displayName || req.user.username} wants “${target.title}”.`,
      href: `/swaps/${swap._id}`,
    });
    // Dedicated email for swap request (owner) — themed to recipient's accent choice
    if (owner?.email) {
      void sendSwapRequestEmail(owner.email, { fromName: req.user.displayName || req.user.username, itemTitle: target.title, swapId: String(swap._id), accent: owner.accent || "red" }).catch(()=>{});
    }

    res.status(201).json({ id: String(swap._id), status: swap.status });
  } catch (err) { next(err); }
});


/** GET /api/me/blocks — list users this member has blocked */
router.get("/blocks", async (req, res, next) => {
  try {
    await req.user.populate({ path: "blockedUsers", select: "username displayName avatar" });
    const items = (req.user.blockedUsers || []).map((u) => ({ username: u.username, displayName: u.displayName || u.username, avatarUrl: u.avatar?.publicId ? signedUrl(u.avatar.publicId) : u.avatar?.url ?? null }));
    res.json({ items });
  } catch (err) { next(err); }
});


/** POST /api/me/blocks — block another user by username (idempotent) */
router.post("/blocks", async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = String(body.username || "").trim();
    if (!username) return res.status(400).json({ error: "Missing username" });
    const other = await User.findOne({ username });
    if (!other) return res.status(404).json({ error: "User not found" });
    if (String(other._id) === String(req.user._id)) return res.status(400).json({ error: "Cannot block yourself" });

    // idempotent add
    const exists = (req.user.blockedUsers || []).some((b) => String(b) === String(other._id));
    if (!exists) {
      req.user.blockedUsers = req.user.blockedUsers || [];
      req.user.blockedUsers.push(other._id);
      await req.user.save();
      // A block removes the follow relationship in both directions so the
      // blocker isn't still "following" someone they blocked (and vice versa).
      await Follow.deleteMany({
        $or: [
          { follower: req.user._id, following: other._id },
          { follower: other._id, following: req.user._id },
        ],
      });
      await recordAudit(req, {
        action: "user.block",
        targetType: "user",
        targetId: String(other._id),
        targetLabel: other.username,
        reason: "User blocked via profile",
      });
    }
    res.status(201).json({ blocked: true, username: other.username });
  } catch (err) { next(err); }
});


/**
 * POST /api/me/reports — flag a listing or user for the moderation queue.
 * Body: { targetType: "listing"|"user", targetId, reason, details }
 * Backward-compatible: { username, reason } still reports that user.
 */
router.post("/reports", async (req, res, next) => {
  try {
    const body = req.body || {};

    // Legacy shape: { username, reason } → a user report.
    if (body.username) {
      const username = String(body.username || "").trim();
      const reason = String(body.reason || "other").trim() || "other";
      if (!username) return res.status(400).json({ error: "Missing username" });
      const other = await User.findOne({ username });
      if (!other) return res.status(404).json({ error: "User not found" });
      if (String(other._id) === String(req.user._id)) return res.status(400).json({ error: "Cannot report yourself" });

      const report = await Report.create({
        reporter: req.user._id,
        targetType: "user",
        target: other._id,
        targetRef: "User",
        reason,
        details: String(body.details || "").trim().slice(0, 600),
      });
      await recordAudit(req, {
        action: "user.report",
        targetType: "user",
        targetId: String(other._id),
        targetLabel: other.username,
        reason,
        metadata: { report: String(report._id) },
      });
      if (req.user.email) void sendReportReceivedEmail(req.user.email, { targetLabel: other.username, reason, accent: req.user.accent || "red" }).catch(()=>{});
      return res.status(201).json({ success: true, reportId: String(report._id) });
    }

    // New shape: { targetType, targetId, reason, details }
    const parsed = z
      .object({
        targetType: z.enum(["listing", "user"]),
        targetId: z.string().refine(mongoose.isValidObjectId, "Invalid target"),
        reason: z.string().trim().max(40).default("other"),
        details: z.string().trim().max(600).default(""),
      })
      .parse(body);

    let label = "";
    if (parsed.targetType === "user") {
      const other = await User.findById(parsed.targetId);
      if (!other) return res.status(404).json({ error: "User not found" });
      if (String(other._id) === String(req.user._id)) return res.status(400).json({ error: "Cannot report yourself" });
      label = other.username;
    } else {
      const listing = await Listing.findById(parsed.targetId);
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      label = listing.title;
    }

    // Keep reasons honest — fall back to "other" if it's not in the list.
    const reason = REPORT_REASONS[parsed.targetType]?.includes(parsed.reason) ? parsed.reason : "other";
    const report = await Report.create({
      reporter: req.user._id,
      targetType: parsed.targetType,
      target: parsed.targetId,
      targetRef: parsed.targetType === "listing" ? "Listing" : "User",
      reason,
      details: parsed.details,
    });
    await recordAudit(req, {
      action: `${parsed.targetType}.report`,
      targetType: parsed.targetType,
      targetId: String(parsed.targetId),
      targetLabel: label,
      reason,
      metadata: { report: String(report._id) },
    });
    if (req.user.email) void sendReportReceivedEmail(req.user.email, { targetLabel: label, reason, accent: req.user.accent || "red" }).catch(()=>{});
    res.status(201).json({ success: true, reportId: String(report._id) });
  } catch (err) { next(err); }
});


/** DELETE /api/me/blocks/:username — unblock a user */
router.delete("/blocks/:username", async (req, res, next) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "Missing username" });
    const other = await User.findOne({ username });
    if (!other) return res.status(404).json({ error: "User not found" });
    req.user.blockedUsers = (req.user.blockedUsers || []).filter((b) => String(b) !== String(other._id));
    await req.user.save();
    await recordAudit(req, {
      action: "user.unblock",
      targetType: "user",
      targetId: String(other._id),
      targetLabel: other.username,
      reason: "User unblocked via profile",
    });
    res.json({ blocked: false, username: other.username });
  } catch (err) { next(err); }
});

// ---- Mute (softer than block — content still shows, notifications suppressed) ----

/** GET /api/me/mutes — list users this member has muted. */
router.get("/mutes", async (req, res, next) => {
  try {
    await req.user.populate({ path: "mutedUsers", select: "username displayName avatar" });
    const items = (req.user.mutedUsers || []).map((u) => ({
      username: u.username,
      displayName: u.displayName || u.username,
      avatarUrl: u.avatar?.publicId ? signedUrl(u.avatar.publicId) : u.avatar?.url ?? null,
    }));
    res.json({ items });
  } catch (err) { next(err); }
});

/** POST /api/me/mutes — mute a user (idempotent). */
router.post("/mutes", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim();
    if (!username) return res.status(400).json({ error: "Missing username" });
    const other = await User.findOne({ username });
    if (!other) return res.status(404).json({ error: "User not found" });
    if (String(other._id) === String(req.user._id)) return res.status(400).json({ error: "Cannot mute yourself" });

    const exists = (req.user.mutedUsers || []).some((m) => String(m) === String(other._id));
    if (!exists) {
      req.user.mutedUsers = req.user.mutedUsers || [];
      req.user.mutedUsers.push(other._id);
      await req.user.save();
    }
    res.status(201).json({ muted: true, username: other.username });
  } catch (err) { next(err); }
});

/** DELETE /api/me/mutes/:username — unmute a user. */
router.delete("/mutes/:username", async (req, res, next) => {
  try {
    const username = String(req.params.username || "").trim();
    if (!username) return res.status(400).json({ error: "Missing username" });
    const other = await User.findOne({ username });
    if (!other) return res.status(404).json({ error: "User not found" });
    req.user.mutedUsers = (req.user.mutedUsers || []).filter((m) => String(m) !== String(other._id));
    await req.user.save();
    res.json({ muted: false, username: other.username });
  } catch (err) { next(err); }
});

// ---- Phone verification (trust badge) ----

/** POST /api/me/phone/verify — issue a 6-digit verification code. */
router.post("/phone/verify", async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("+phoneVerifyCodeHash +phoneVerifyExpiresAt +phoneVerifyAttempts");
    if (!user.phone) return res.status(400).json({ error: "Add a phone number in Settings first" });

    const code = crypto.randomInt(100000, 1000000).toString();
    user.phoneVerifyCodeHash = crypto.createHash("sha256").update(code).digest("hex");
    user.phoneVerifyExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    user.phoneVerifyAttempts = 0;
    await user.save();

    await recordAudit(req, { action: "user.phone_verify_sent", targetType: "user", targetId: String(user._id), targetLabel: user.username });

    // Deliver the code: SMS first via Twilio when it's configured, falling
    // back to email if SMTP/Resend is set up, and finally to a dev-mode
    // console log so the flow still works end-to-end without either provider.
    const dev = process.env.NODE_ENV !== "production";
    if (smsEnabled) {
      const sent = await sendPhoneVerificationSMS(user.phone, code);
      if (sent) return res.json({ ok: true, sent: "sms" });
      // SMS provider errored (bad number, carrier filter, etc.) — fall through
      // to email rather than leaving the member with no code at all.
    }
    if (user.email && emailEnabled) {
      await sendPhoneCodeEmail(user.email, code, user.accent || "red");
      return res.json({ ok: true, sent: "email" });
    }
    if (dev) console.log(`[verify] phone code for ${user.username}: ${code}`);
    res.json({ ok: true, sent: "dev", devCode: dev ? code : undefined });
  } catch (err) { next(err); }
});

/** POST /api/me/phone/confirm — confirm the code to earn the verified badge. */
router.post("/phone/confirm", async (req, res, next) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: "Enter the 6-digit code" });

    const user = await User.findById(req.user._id).select("+phoneVerifyCodeHash +phoneVerifyExpiresAt +phoneVerifyAttempts");
    const hash = crypto.createHash("sha256").update(code).digest("hex");
    if (!user.phoneVerifyCodeHash || user.phoneVerifyCodeHash !== hash) {
      // Lock the code out after too many wrong guesses so codes can't be
      // brute-forced — the member must request a fresh one.
      user.phoneVerifyAttempts = (user.phoneVerifyAttempts || 0) + 1;
      if (user.phoneVerifyAttempts >= 5) {
        user.phoneVerifyCodeHash = null;
        user.phoneVerifyExpiresAt = null;
        await user.save();
        return res.status(429).json({ error: "Too many wrong codes — request a new one." });
      }
      await user.save();
      return res.status(400).json({ error: "That code isn't right. Try again." });
    }
    if (!user.phoneVerifyExpiresAt || user.phoneVerifyExpiresAt < new Date()) {
      return res.status(400).json({ error: "That code has expired — request a new one." });
    }

    user.phoneVerified = true;
    user.phoneVerifyCodeHash = null;
    user.phoneVerifyExpiresAt = null;
    user.phoneVerifyAttempts = 0;
    await user.save();

    await recordAudit(req, { action: "user.phone_verified", targetType: "user", targetId: String(user._id), targetLabel: user.username });
    res.json({ ok: true, phoneVerified: true });
  } catch (err) { next(err); }
});

// ---- Shipping addresses (multiple saved — used on every shipping swap) ----

function serializeAddress(a) {
  return {
    id: String(a._id),
    label: a.label ?? "",
    name: a.name ?? "",
    line1: a.line1 ?? "",
    line2: a.line2 ?? "",
    city: a.city ?? "",
    postal: a.postal ?? "",
    country: a.country ?? "",
    phone: a.phone ?? "",
    isDefault: Boolean(a.isDefault),
  };
}

/** GET /api/me/addresses — list saved shipping addresses (with legacy migration). */
router.get("/addresses", async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("shippingAddresses shippingProfile");
    let addrs = user.shippingAddresses ?? [];
    // Legacy migration: if no addresses yet but old single profile is filled, surface it as a default entry
    if (!addrs.length && user.shippingProfile?.line1) {
      const p = user.shippingProfile;
      addrs = [{ _id: new mongoose.Types.ObjectId(), label: "Home", name: p.name, line1: p.line1, line2: p.line2, city: p.city, postal: p.postal, country: p.country, phone: p.phone, isDefault: true }];
    }
    res.json({ items: addrs.map(serializeAddress) });
  } catch (err) { next(err); }
});

/** POST /api/me/addresses — add a new shipping address. */
router.post("/addresses", async (req, res, next) => {
  try {
    const data = addressSchema.parse(req.body);
    const user = await User.findById(req.user._id).select("shippingAddresses");
    // Enforce max 5 addresses
    if ((user.shippingAddresses?.length ?? 0) >= 5) return res.status(400).json({ error: "You can save up to 5 addresses." });
    // If this is default, unset others
    if (data.isDefault) {
      user.shippingAddresses.forEach((a) => { a.isDefault = false; });
    } else if (!user.shippingAddresses.length) {
      data.isDefault = true; // first address is default
    }
    user.shippingAddresses.push(data);
    await user.save();
    const added = user.shippingAddresses[user.shippingAddresses.length - 1];
    res.status(201).json({ address: serializeAddress(added) });
  } catch (err) { next(err); }
});

/** PATCH /api/me/addresses/:id — update an address. */
router.patch("/addresses/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Address not found" });
    const data = updateAddressSchema.parse(req.body);
    const user = await User.findById(req.user._id).select("shippingAddresses");
    const addr = user.shippingAddresses.id(req.params.id);
    if (!addr) return res.status(404).json({ error: "Address not found" });
    Object.assign(addr, data);
    if (data.isDefault) {
      user.shippingAddresses.forEach((a) => { if (String(a._id) !== String(addr._id)) a.isDefault = false; });
    }
    // Ensure at least one default remains
    if (!user.shippingAddresses.some((a) => a.isDefault) && user.shippingAddresses.length) {
      user.shippingAddresses[0].isDefault = true;
    }
    await user.save();
    res.json({ address: serializeAddress(addr) });
  } catch (err) { next(err); }
});

/** DELETE /api/me/addresses/:id — remove an address. */
router.delete("/addresses/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Address not found" });
    const user = await User.findById(req.user._id).select("shippingAddresses");
    const addr = user.shippingAddresses.id(req.params.id);
    if (!addr) return res.status(404).json({ error: "Address not found" });
    const wasDefault = addr.isDefault;
    addr.deleteOne();
    if (wasDefault && user.shippingAddresses.length) {
      user.shippingAddresses[0].isDefault = true;
    }
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** POST /api/me/addresses/:id/default — set default address. */
router.post("/addresses/:id/default", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Address not found" });
    const user = await User.findById(req.user._id).select("shippingAddresses");
    const addr = user.shippingAddresses.id(req.params.id);
    if (!addr) return res.status(404).json({ error: "Address not found" });
    user.shippingAddresses.forEach((a) => { a.isDefault = String(a._id) === String(addr._id); });
    await user.save();
    res.json({ address: serializeAddress(addr) });
  } catch (err) { next(err); }
});

/**
 * Swap status state machine. Keyed by current status → { target: whoMayAct }.
 * This is the single source of truth for what a swap may become next and who
 * is allowed to move it, so e.g. a requester can never cancel after the owner
 * accepted, and the owner can never decline after accepting.
 */
const SWAP_TRANSITIONS = {
  pending: { accepted: "owner", declined: "owner", cancelled: "requester" },
  accepted: { completed: "either" },
  declined: {},
  completed: {},
  cancelled: {},
};

/** Pending swap requests expire after this long without a reply. */
const SWAP_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function validateTransition(from, to, isOwner, isRequester) {
  const allowed = SWAP_TRANSITIONS[from] ?? {};
  if (!allowed[to]) {
    return `This swap can't change from "${from}" to "${to}".`;
  }
  const who = allowed[to];
  if (who === "owner" && !isOwner) return "Only the owner can do that.";
  if (who === "requester" && !isRequester) return "Only the requester can do that.";
  return null;
}

/**
 * Delivery must be verified before a swap is marked completed, so items are
 * never consumed without the exchange actually happening. The requester
 * confirms receipt (either party's completion is then allowed); for a shipping
 * swap the owner must also have shared a tracking number first. Neither the
 * owner self-declaring "delivered" nor a meetup swap with no handoff can
 * complete the swap.
 */
function deliveryVerified(swap) {
  if (!swap.receiptConfirmedAt) return false;
  if (swap.meetup) return Boolean(swap.meetupPlace && String(swap.meetupPlace).trim().length > 0);
  return Boolean(swap.trackingNumber);
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function isTxUnsupported(err) {
  const code = err?.code ?? err?.codeName;
  const msg = String(err?.message || "");
  return code === 20 || /Transaction numbers are only allowed on a replica set|does not support transactions|standalone/.test(msg);
}

/**
 * Run `fn(session)` inside a MongoDB transaction so the swap status, escrow
 * movement and item consumption commit (or roll back) atomically. On
 * deployments without multi-document transactions (e.g. Atlas M0) it falls
 * back to a non-transactional run but logs that loudly — the state machine and
 * idempotency guards still protect the ledger.
 */
async function runInTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    try {
      return await session.withTransaction(() => fn(session));
    } catch (err) {
      if (isTxUnsupported(err)) {
        console.warn("[swap] transactions unavailable — running swap update non-transactionally:", err.message);
        return fn(null);
      }
      throw err;
    }
  } finally {
    session.endSession();
  }
}

/** PATCH /api/me/swaps/:id — owner accepts/declines, requester cancels, completion. */
router.patch("/swaps/:id", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    const isOwner = String(swap.owner?._id ?? swap.owner) === String(req.user._id);
    const isRequester = String(swap.requester?._id ?? swap.requester) === String(req.user._id);

    const { status } = z.object({ status: z.enum(["accepted", "declined", "completed", "cancelled"]) }).parse(req.body);
    const from = swap.status;

    const transitionError = validateTransition(from, status, isOwner, isRequester);
    if (transitionError) return res.status(409).json({ error: transitionError });

    // A swap can't complete while a dispute is open — escrow must not move
    // until the moderator rules.
    if (status === "completed") {
      const openDispute = await Dispute.exists({ swap: swap._id, status: "open" });
      if (openDispute) return res.status(409).json({ error: "This swap is under dispute — resolve it before completing." });
    }

    // The requester must be able to cover the full escrow before accepting.
    // Partial holds silently short the owner on completion, so accept is
    // refused until the balance is there.
    if (status === "accepted" && isOwner) {
      // A pending swap may point at a listing whose value was edited after the
      // proposal. Refresh the snapshot from the current listing values before
      // checking the balance and creating escrow, so the confirmation dialog
      // and the server enforce the same negotiated amount.
      const currentRequestedValue = Number(swap.requestedListing?.value ?? 0) || 0;
      const offeredItems = Array.isArray(swap.offeredListings) && swap.offeredListings.length
        ? swap.offeredListings
        : swap.offeredListing
          ? [swap.offeredListing]
          : [];
      const currentOfferedValue = offeredItems.reduce((total, item) => total + (Number(item?.value ?? 0) || 0), 0);
      swap.requestedValue = currentRequestedValue;
      swap.offeredValue = offeredItems.length ? currentOfferedValue : null;
      await swap.save();
      const net = await netCreditsForSwap(swap);
      if (net > 0) {
        const requester = await User.findById(swap.requester?._id ?? swap.requester).select("credits");
        if ((requester?.credits ?? 0) < net) {
          return res.status(400).json({
            error: `The requester needs ${net} credits in escrow to accept this swap — top up their balance first.`,
            needed: net,
            balance: requester?.credits ?? 0,
          });
        }
      }
    }

    if (status === "completed" && !deliveryVerified(swap)) {
      if (swap.meetup && !swap.meetupPlace) {
        return res.status(400).json({ error: "Set a meetup place before completing — the exchange needs a location." });
      }
      return res.status(400).json({
        error: swap.receiptConfirmedAt
          ? "This swap can only be completed after the item is received."
          : swap.meetup
            ? "Confirm you received the item before completing — that's what releases the credits to the other member."
            : "The recipient must confirm the package arrived before this swap can be completed.",
      });
    }

    // Apply the status change, escrow movement and item consumption atomically.
    let txFallback = false;
    const committed = [];
    let heldEscrow = false;
    try {
      await runInTransaction(async (session) => {
        if (!session) txFallback = true;
        // Re-read under the lock to prevent a double-accept / race.
        const locked = await Swap.findById(swap._id).session(session);
        if (!locked) throw httpError(404, "Swap not found");
        if (locked.status !== from) {
          throw httpError(409, "This swap has already been updated — refresh and try again.");
        }

        if (status === "accepted") {
          // Reserve the items first (first-wins per unit), then hold escrow.
          // If anything after this throws, the catch undoes the reservations.
          await commitListings(swap, { session, committed });
          await escrowHold(swap, swap.requestedListing, { session });
          heldEscrow = true;
        } else if (status === "completed") {
          await settleEscrow(swap, status, { session });
          await consumeListings(swap, { session });
          // A completed swap counts toward both members' public "swaps" stat.
          await Promise.all([
            User.updateOne(
              { _id: swap.requester?._id ?? swap.requester },
              { $inc: { swaps: 1 } },
              { session: session ?? null },
            ),
            User.updateOne(
              { _id: swap.owner?._id ?? swap.owner },
              { $inc: { swaps: 1 } },
              { session: session ?? null },
            ),
          ]);
        } else if (status === "declined" || status === "cancelled") {
          // Both transitions only ever leave "pending" (see SWAP_TRANSITIONS),
          // and a pending swap never reserved units, so there is nothing to
          // release here — just refund any escrow (none exists for a pending
          // swap either, so this is a no-op safety).
          await settleEscrow(swap, status, { session });
        }

        locked.status = status;
        if (status === "completed") locked.completedAt = new Date();
        // Any terminal move (or an accept) ends the pending window.
        if (from === "pending" && status !== "pending") locked.expiresAt = null;
        await locked.save({ session });
      });
    } catch (err) {
      // Non-transactional fallback (Atlas M0): a failure after the reservations
      // or the hold must be undone by hand, otherwise units stay reserved and
      // credits stay locked against a swap that never got accepted.
      if (txFallback && status === "accepted") {
        const cleanup = [];
        if (committed.length) cleanup.push(releaseListingIds(committed));
        if (heldEscrow) cleanup.push(escrowRefund(swap, "Accept rolled back after an error."));
        await Promise.allSettled(cleanup);
      }
      if (err?.status === 409) return res.status(409).json({ error: err.message });
      if (err?.status === 404) return res.status(404).json({ error: err.message });
      if (err?.status === 400) return res.status(400).json({ error: err.message });
      throw err;
    }

    swap.status = status;
    await systemNote(swap._id, `${req.user.username} marked this swap as ${status}.`);
    publishSwap(swap, { type: "status", status: swap.status });

    // The other participant gets an alert when the swap is accepted (or falls through).
    const counterpartyId = isOwner
      ? (swap.requester?._id ?? swap.requester)
      : (swap.owner?._id ?? swap.owner);
    if (counterpartyId) {
      const kind = status === "accepted" ? "swap_accepted" : "message";
      const ok = await notify(counterpartyId, {
        kind,
        title: status === "accepted" ? "Swap accepted 🎉" : `Swap ${status}`,
        body: `${req.user.displayName || req.user.username} marked the swap as ${status}.`,
        href: `/swaps/${swap._id}`,
        actor: req.user._id,
      });
      if (ok) void pushToUser(counterpartyId, {
        title: "Swapt",
        body: status === "accepted"
          ? `${req.user.displayName || req.user.username} accepted your swap 🎉`
          : `Your swap was marked ${status}.`,
        href: `/swaps/${swap._id}`,
      });
      // Dedicated status emails — themed to recipient's accent
      try {
        const counterparty = await User.findById(counterpartyId).select("email accent");
        if (counterparty?.email) {
          if (status === "accepted") {
            void sendSwapAcceptedEmail(counterparty.email, { fromName: req.user.displayName || req.user.username, swapId: String(swap._id), accent: counterparty.accent || "red" }).catch(()=>{});
          } else if (["declined","cancelled","completed"].includes(status)) {
            void sendSwapStatusEmail(counterparty.email, { fromName: req.user.displayName || req.user.username, status, swapId: String(swap._id), accent: counterparty.accent || "red" }).catch(()=>{});
          }
        }
      } catch {}
    }

    // A terminal state (completed/declined/cancelled) feeds both members'
    // swap-completion (reliability) score.
    if (["completed", "declined", "cancelled"].includes(status)) {
      await Promise.allSettled([
        recomputeReliability(swap.requester?._id ?? swap.requester),
        recomputeReliability(swap.owner?._id ?? swap.owner),
      ]);
    }

    res.json({ id: String(swap._id), status: swap.status });
  } catch (err) { next(err); }
});

/** GET /api/me/swaps/:id — a single negotiation thread header. */
router.get("/swaps/:id", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    const [unreadCount, dispute, escrow] = await Promise.all([
      Message.countDocuments({
        swap: swap._id,
        sender: { $ne: req.user._id },
        readAt: null,
      }),
      Dispute.findOne({ swap: swap._id }).sort({ createdAt: -1 }),
      escrowForSwap(swap._id),
    ]);
    res.json({ swap: serializeSwap(swap, req.user._id, unreadCount, dispute, escrow) });
  } catch (err) { next(err); }
});

/**
 * POST /api/me/swaps/:id/tracking — record a carrier + tracking number for a
 * shipping swap (owner only, after accept). Demo mode also mints a fake label
 * URL so the label flow can be seen end-to-end without a carrier account.
 */
router.post("/swaps/:id/tracking", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    const isOwner = String(swap.owner?._id ?? swap.owner) === String(req.user._id);
    if (!isOwner) return res.status(403).json({ error: "Only the listing owner can add tracking" });
    if (swap.status !== "accepted") return res.status(400).json({ error: "Tracking can only be added once the swap is accepted" });
    if (!swap.shipping) return res.status(400).json({ error: "This swap is a local meetup, not shipping" });

    const { carrier, trackingNumber, shippingStatus } = z
      .object({
        carrier: z.string().trim().max(40).optional().default(""),
        trackingNumber: z.string().trim().max(120).optional().default(""),
        shippingStatus: z.enum(["awaiting_shipment", "shipped", "in_transit", "delivered", "exception"]).optional(),
      })
      .parse(req.body);

    if (trackingNumber) {
      swap.trackingNumber = trackingNumber;
      swap.carrier = carrier || swap.carrier;
      swap.shippingStatus = shippingStatus ?? "shipped";
      swap.labelUrl = swap.labelUrl || (process.env.CARRIER_API_KEY ? "" : `data:application/pdf;base64,${Buffer.from("demo-label").toString("base64")}`);
      await systemNote(swap._id, `${req.user.username} shared tracking: ${carrier || "carrier"} ${trackingNumber}.`);
      const counterpartyId = swap.requester?._id ?? swap.requester;
      if (counterpartyId) {
        void notify(counterpartyId, {
          kind: "message",
          title: "Your swap has shipped 📦",
          body: `${req.user.displayName || req.user.username} shared a tracking number for your swap.`,
          href: `/swaps/${swap._id}`,
          actor: req.user._id,
        });
        try { const cp = await User.findById(counterpartyId).select("email accent"); if (cp?.email) void sendTrackingAddedEmail(cp.email, { fromName: req.user.displayName || req.user.username, carrier: carrier || swap.carrier || "carrier", trackingNumber, swapId: String(swap._id), accent: cp.accent || "red" }).catch(()=>{}); } catch {}
      }
      await swap.save();
      publishSwap(swap, { type: "status", status: swap.status });
    }

    res.json({
      carrier: swap.carrier,
      trackingNumber: swap.trackingNumber,
      shippingStatus: swap.shippingStatus,
      labelUrl: swap.labelUrl,
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/me/swaps/:id/receipt — the requester confirms the item arrived.
 * This is the proof of delivery: only the requester can mark it, and a swap
 * can't be completed until they do. Idempotent.
 */
router.post("/swaps/:id/receipt", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    const isRequester = String(swap.requester?._id ?? swap.requester) === String(req.user._id);
    if (!isRequester) return res.status(403).json({ error: "Only the member receiving the item can confirm receipt" });
    if (swap.status !== "accepted") return res.status(400).json({ error: "Receipt can only be confirmed once the swap is accepted" });

    if (!swap.receiptConfirmedAt) {
      swap.receiptConfirmedAt = new Date();
      await swap.save();
      await systemNote(swap._id, `${req.user.username} confirmed they received the item.`);
      publishSwap(swap, { type: "status", status: swap.status });
      const ownerId = swap.owner?._id ?? swap.owner;
      if (ownerId) {
        void notify(ownerId, {
          kind: "message",
          title: "Item received ✅",
          body: `${req.user.displayName || req.user.username} confirmed they received the item — you can now complete the swap.`,
          href: `/swaps/${swap._id}`,
          actor: req.user._id,
        });
        try { const ownerUser = await User.findById(ownerId).select("email accent"); if (ownerUser?.email) void sendReceiptConfirmedEmail(ownerUser.email, { fromName: req.user.displayName || req.user.username, swapId: String(swap._id), accent: ownerUser.accent || "red" }).catch(()=>{}); } catch {}
      }
    }

    res.json({ confirmed: true, receiptConfirmedAt: swap.receiptConfirmedAt?.toISOString() ?? null });
  } catch (err) { next(err); }
});

/**
 * POST /api/me/swaps/:id/counter — the owner fires back a counter-offer on a
 * pending swap. They may pick a different listing of theirs to ask for, add a
 * note and tweak the meetup details. Each new offer stamps `counteredAt` and
 * the pending window restarts, so an offer never expires while being
 * negotiated. The requester then accepts, declines or counters again.
 */
router.post("/swaps/:id/counter", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    const isOwner = String(swap.owner?._id ?? swap.owner) === String(req.user._id);
    const isRequester = String(swap.requester?._id ?? swap.requester) === String(req.user._id);
    if (!isOwner && !isRequester) return res.status(403).json({ error: "Not your swap" });
    if (swap.status !== "pending") return res.status(409).json({ error: "Only pending swaps can be countered" });

    const data = z
      .object({
        requestedListing: z.string().refine(mongoose.isValidObjectId, "Invalid listing").optional(),
        message: z.string().trim().max(500).optional().default(""),
        meetup: z.coerce.boolean().optional(),
        meetupPlace: z.string().trim().max(160).optional().default(""),
        meetupTime: z.string().datetime().optional().nullable(),
        meetupLat: z.number().min(-90).max(90).optional().nullable(),
        meetupLng: z.number().min(-180).max(180).optional().nullable(),
        // Optional free-form message that will appear as a normal chat bubble
        // alongside the system counter-offer card.
        chatMessage: z.string().trim().max(1000).optional().default(""),
      })
      .parse(req.body);

    if (data.requestedListing) {
      const target = await Listing.findById(data.requestedListing);
      if (!target || target.status !== "active") return res.status(404).json({ error: "Listing not available" });
      if (String(target.seller) !== String(req.user._id)) {
        return res.status(400).json({ error: "Counter-offers can only request your own listing" });
      }
      swap.requestedListing = target._id;
      // Re-snapshot the requested value so escrow always reflects the deal as
      // last agreed (and never a later live edit of the listing).
      swap.requestedValue = target.value ?? 0;
    }

    if (data.message) swap.message = data.message;
    if (typeof data.meetup === "boolean") {
      swap.meetup = data.meetup;
      // A swap is either a meetup or shipping — never both, never neither.
      // Switching the mode clears the other side's fields so completion logic
      // can't get stuck or complete without a handoff.
      if (data.meetup) {
        swap.shipping = false;
        swap.carrier = "";
        swap.trackingNumber = "";
        swap.shippingStatus = null;
        swap.labelUrl = "";
        if (data.meetupPlace) swap.meetupPlace = data.meetupPlace;
        if (data.meetupLat != null) swap.meetupLat = data.meetupLat;
        if (data.meetupLng != null) swap.meetupLng = data.meetupLng;
      } else {
        swap.meetupPlace = "";
        swap.meetupTime = null;
        swap.meetupLat = null;
        swap.meetupLng = null;
        if (!swap.shipping) swap.shipping = true;
      }
    } else {
      if (data.meetupPlace) swap.meetupPlace = data.meetupPlace;
      if (data.meetupLat != null) swap.meetupLat = data.meetupLat;
      if (data.meetupLng != null) swap.meetupLng = data.meetupLng;
    }
    if (data.meetupTime) swap.meetupTime = new Date(data.meetupTime);
    swap.counteredAt = new Date();
    swap.expiresAt = new Date(Date.now() + SWAP_EXPIRY_MS);
    await swap.save();

    // Build detailed counter message so chat shows what actually changed
    const counterDetails = [];
    if (data.message) counterDetails.push(`Note: "${data.message}"`);
    if (typeof data.meetup === "boolean") {
      if (data.meetup) {
        let s = "Meetup";
        const place = data.meetupPlace || swap.meetupPlace;
        if (place) s += ` at ${place}`;
        const t = data.meetupTime ? new Date(data.meetupTime) : swap.meetupTime;
        if (t) s += ` on ${new Date(t).toLocaleString()}`;
        const clat = data.meetupLat ?? swap.meetupLat;
        const clng = data.meetupLng ?? swap.meetupLng;
        if (clat != null && clng != null) s += ` [${Number(clat).toFixed(4)}, ${Number(clng).toFixed(4)}]`;
        counterDetails.push(s);
      } else {
        counterDetails.push("Shipping");
      }
    } else {
      if (data.meetupPlace) counterDetails.push(`Place: ${data.meetupPlace}`);
      if (data.meetupTime) counterDetails.push(`Time: ${new Date(data.meetupTime).toLocaleString()}`);
      if (data.meetupLat != null && data.meetupLng != null) counterDetails.push(`Pin: ${Number(data.meetupLat).toFixed(4)}, ${Number(data.meetupLng).toFixed(4)}`);
    }
    const detailStr = counterDetails.length ? ` — ${counterDetails.join(" • ")}` : "";
    await systemNote(swap._id, `${req.user.username} sent a counter-offer${detailStr}.`);
    // Optional companion chat message — appears as a regular bubble alongside
    // the structured counter-offer card. Respects block state via message
    // creation (counter itself is already allowed for this swap).
    const chatBody = (data.chatMessage ?? "").trim().slice(0, 1000);
    if (chatBody) {
      await Message.create({
        swap: swap._id,
        conversation: swap.conversation,
        sender: req.user._id,
        senderUsername: req.user.username,
        kind: "text",
        body: chatBody,
      });
      await Conversation.updateOne({ _id: swap.conversation }, { $set: { lastMessageAt: new Date() } });
      // Publish as a message event so both sides' threads scroll to it live.
      publishSwap(swap, { type: "message" });
      void publishConversation(swap.conversation, { type: "message" });
    } else {
      publishSwap(swap, { type: "counter" });
    }

    const isRequesterCounter = String(swap.requester?._id ?? swap.requester) === String(req.user._id);
    const counterpartyId = isRequesterCounter ? (swap.owner?._id ?? swap.owner) : (swap.requester?._id ?? swap.requester);
    if (counterpartyId && String(counterpartyId) !== String(req.user._id)) {
      void notify(counterpartyId, {
        kind: "message",
        title: "Counter-offer received",
        body: `${req.user.displayName || req.user.username} sent you a counter-offer on your swap request.`,
        href: `/swaps/${swap._id}`,
        actor: req.user._id,
      });
      try {
        const cp = await User.findById(counterpartyId).select("email accent");
        if (cp?.email) void sendCounterOfferEmail(cp.email, { fromName: req.user.displayName || req.user.username, swapId: String(swap._id), accent: cp.accent || "red" }).catch(()=>{});
      } catch {}
    }

    res.json({ id: String(swap._id), status: swap.status, counteredAt: swap.counteredAt.toISOString() });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/me/swaps/:id/meetup — either member schedules or edits the local
 * meetup place + time while the swap is pending or accepted.
 */
router.patch("/swaps/:id/meetup", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    if (!["pending", "accepted"].includes(swap.status)) {
      return res.status(409).json({ error: "Meetup can only be scheduled on a pending or accepted swap" });
    }
    if (!swap.meetup) return res.status(400).json({ error: "This swap is shipping, not a local meetup" });

    const { meetupPlace, meetupTime, meetupLat, meetupLng } = z
      .object({
        meetupPlace: z.string().trim().max(160).optional().default(""),
        meetupTime: z.string().datetime().optional().nullable(),
        meetupLat: z.number().min(-90).max(90).optional().nullable(),
        meetupLng: z.number().min(-180).max(180).optional().nullable(),
      })
      .parse(req.body);

    if (meetupPlace) swap.meetupPlace = meetupPlace;
    if (meetupTime) swap.meetupTime = new Date(meetupTime);
    if (meetupLat != null) swap.meetupLat = meetupLat;
    if (meetupLng != null) swap.meetupLng = meetupLng;
    await swap.save();

    const when = swap.meetupTime ? ` at ${new Date(swap.meetupTime).toLocaleString()}` : "";
    await systemNote(swap._id, `${req.user.username} scheduled a meetup: ${swap.meetupPlace || "a local spot"}${when}.`);
    publishSwap(swap, { type: "meetup" });
    // Notify + email counterparty about meetup update — themed to recipient's accent
    const meetupCounterparty = String(swap.requester?._id ?? swap.requester) === String(req.user._id) ? (swap.owner?._id ?? swap.owner) : (swap.requester?._id ?? swap.requester);
    if (meetupCounterparty) {
      void notify(meetupCounterparty, { kind: "message", title: "Meetup updated", body: `${req.user.displayName || req.user.username} updated the meetup${swap.meetupPlace ? ` to ${swap.meetupPlace}` : ""}.`, href: `/swaps/${swap._id}`, actor: req.user._id });
      try { const cp = await User.findById(meetupCounterparty).select("email accent"); if (cp?.email) void sendMeetupUpdatedEmail(cp.email, { fromName: req.user.displayName || req.user.username, place: swap.meetupPlace || "", time: swap.meetupTime ? swap.meetupTime.toISOString() : null, swapId: String(swap._id), accent: cp.accent || "red" }).catch(()=>{}); } catch {}
    }

    res.json({
      meetupPlace: swap.meetupPlace,
      meetupTime: swap.meetupTime ? swap.meetupTime.toISOString() : null,
      meetupLat: swap.meetupLat ?? null,
      meetupLng: swap.meetupLng ?? null,
    });
  } catch (err) { next(err); }
});

/** GET /api/me/swaps/:id/disputes — disputes on this swap (participants only). */
router.get("/swaps/:id/disputes", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    const items = await Dispute.find({ swap: swap._id }).sort({ createdAt: -1 }).populate("openedBy", "username");
    res.json({
      items: items.map((d) => ({
        id: String(d._id),
        reason: d.reason,
        description: d.description,
        status: d.status,
        openedBy: d.openedBy?.username ?? "member",
        resolutionNote: d.resolutionNote,
        outcome: d.outcome,
        createdAt: d.createdAt,
        // Evidence URLs carry a short-lived token minted here — the media
        // proxy refuses to serve evidence without it.
        evidence: (d.evidence ?? []).map((e) => ({
          publicId: e.publicId,
          url: e.publicId ? signEvidenceUrl(e.publicId) : (e.url ?? null),
          width: e.width,
          height: e.height,
          bytes: e.bytes,
          by: e.by ? String(e.by) : null,
          caption: e.caption,
          createdAt: e.createdAt,
        })),
        timeline: d.timeline ?? [],
      })),
    });
  } catch (err) { next(err); }
});

/** POST /api/me/swaps/:id/disputes — open a dispute (one open per swap).
 * With returnWindowDays per listing, a completed swap can still be disputed within the window.
 */
router.post("/swaps/:id/disputes", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    // Declined/cancelled swaps never get disputes; completed only within return window (policy)
    if (["declined", "cancelled"].includes(swap.status)) {
      return res.status(409).json({ error: "A dispute can only be opened while the swap is pending, accepted, or within the return window after completion." });
    }
    if (swap.status === "completed") {
      // Determine the effective return window — use the requested listing's window (and any offered bundle's max)
      let windowDays = 7;
      try {
        const ids = swapListingIds(swap);
        if (ids.length) {
          const listings = await Listing.find({ _id: { $in: ids } }).select("returnWindowDays").lean();
          if (listings.length) windowDays = Math.max(...listings.map((l) => l.returnWindowDays ?? 7));
        }
      } catch {}
      if (windowDays === 0) return res.status(409).json({ error: "This listing has a no-returns policy — disputes cannot be opened after completion." });
      const completedAt = swap.completedAt ? new Date(swap.completedAt).getTime() : (swap.createdAt ? new Date(swap.createdAt).getTime() : Date.now());
      const elapsed = Date.now() - completedAt;
      if (elapsed > windowDays * 86400000) {
        return res.status(409).json({ error: `Return window expired — disputes must be opened within ${windowDays} days after completion.` });
      }
    }

    const existing = await Dispute.findOne({ swap: swap._id, status: "open" });
    if (existing) return res.status(409).json({ error: "A dispute is already open on this swap." });

    const { reason, description } = z
      .object({
        reason: z.string().trim().max(60).default("Other"),
        description: z.string().trim().max(1000).default(""),
      })
      .parse(req.body ?? {});
    const safeReason = DISPUTE_REASONS.includes(reason) ? reason : "Other";

    const dispute = await Dispute.create({
      swap: swap._id,
      openedBy: req.user._id,
      reason: safeReason,
      description,
      timeline: [{ actor: req.user.username, action: "opened", note: `${safeReason}${description ? ` — ${description}` : ""}` }],
    });

    await systemNote(swap._id, `${req.user.username} opened a dispute: ${safeReason}.`);
    await recordAudit(req, {
      action: "swap.dispute_open",
      targetType: "user",
      targetId: String(req.user._id),
      targetLabel: req.user.username,
      reason: safeReason,
      metadata: { swap: String(swap._id), dispute: String(dispute._id) },
    });
    // Email counterparty about dispute
    const disputeOtherId = String(swap.requester?._id ?? swap.requester) === String(req.user._id) ? (swap.owner?._id ?? swap.owner) : (swap.requester?._id ?? swap.requester);
    if (disputeOtherId) {
      void notify(disputeOtherId, { kind: "message", title: "Dispute opened", body: `${req.user.displayName || req.user.username} opened a dispute: ${safeReason}.`, href: `/swaps/${swap._id}`, actor: req.user._id });
      try { const other = await User.findById(disputeOtherId).select("email accent"); if (other?.email) void sendDisputeOpenedEmail(other.email, { fromName: req.user.displayName || req.user.username, reason: safeReason, swapId: String(swap._id), accent: other.accent || "red" }).catch(()=>{}); } catch {}
    }

    res.status(201).json({
      dispute: { id: String(dispute._id), reason: safeReason, description, status: dispute.status },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/me/swaps/:id/disputes/:disputeId/evidence — upload evidence
 * (photos) for an open dispute on a swap the member is part of.
 */
router.post("/swaps/:id/disputes/:disputeId/evidence", upload.array("evidence", 6), validateImageUpload, async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    const dispute = await Dispute.findOne({ _id: req.params.disputeId, swap: swap._id, status: "open" });
    if (!dispute) return res.status(404).json({ error: "Open dispute not found" });

    const files = req.files ?? [];
    if (!files.length) return res.status(400).json({ error: "No evidence images were uploaded." });

    const uploaded = [];
    for (const file of files) {
      const result = await uploadBuffer(file.buffer, { folder: "swapt/dispute-evidence" });
      uploaded.push({
        publicId: result.public_id,
        url: null,
        width: result.width ?? 0,
        height: result.height ?? 0,
        bytes: result.bytes ?? file.size,
        by: req.user._id,
        createdAt: new Date(),
      });
    }

    dispute.evidence.push(...uploaded);
    dispute.timeline.push({ actor: req.user.username, action: "evidence_added", note: `Uploaded ${uploaded.length} photo(s).` });
    await dispute.save();

    res.json({
      evidence: dispute.evidence.map((e) => ({
        publicId: e.publicId,
        url: e.publicId ? signEvidenceUrl(e.publicId) : (e.url ?? null),
        width: e.width,
        height: e.height,
        bytes: e.bytes,
        by: e.by ? String(e.by) : null,
        createdAt: e.createdAt,
      })),
      timeline: dispute.timeline,
    });
  } catch (err) { next(err); }
});

/** GET /api/me/swaps/:id/disputes/:disputeId/messages — separate dispute chat */
router.get("/swaps/:id/disputes/:disputeId/messages", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    const dispute = await Dispute.findOne({ _id: req.params.disputeId, swap: swap._id });
    if (!dispute) return res.status(404).json({ error: "Dispute not found" });
    const { DisputeMessage } = await import("../models/DisputeMessage.js");
    const msgs = await DisputeMessage.find({ dispute: dispute._id, swap: swap._id }).sort({ createdAt: 1 }).limit(100).populate("sender", "username displayName avatar");
    res.json({
      items: msgs.map((m) => ({
        id: String(m._id),
        body: m.body,
        image: m.image ? (m.image.startsWith("http") ? m.image : signedUrl(m.image)) : null,
        author: m.senderUsername,
        mine: String(m.sender) === String(req.user._id),
        createdAt: m.createdAt,
      })),
    });
  } catch (err) { next(err); }
});

/** POST /api/me/swaps/:id/disputes/:disputeId/messages — send in dispute thread (text + optional photo) */
router.post("/swaps/:id/disputes/:disputeId/messages", upload.single("image"), validateImageUpload, async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    const dispute = await Dispute.findOne({ _id: req.params.disputeId, swap: swap._id, status: "open" });
    if (!dispute) return res.status(404).json({ error: "Open dispute not found" });
    const parsed = z.object({ body: z.string().trim().max(1000).optional().default(""), image: z.string().optional() }).parse(req.body ?? {});
    let image = parsed.image ?? null;
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer);
      image = result.public_id;
    }
    const body = (parsed.body ?? "").trim();
    if (!body && !image) return res.status(400).json({ error: "Message body or image required" });
    const { DisputeMessage } = await import("../models/DisputeMessage.js");
    const msg = await DisputeMessage.create({
      dispute: dispute._id,
      swap: swap._id,
      sender: req.user._id,
      senderUsername: req.user.username,
      body,
      image,
    });
    dispute.timeline.push({ actor: req.user.username, action: "dispute_message", note: body?.trim().slice(0, 80) || "Sent a dispute message." });
    await dispute.save();
    // Notify other participant + moderators (notify counterparty)
    const otherId = String(swap.requester) === String(req.user._id) ? swap.owner : swap.requester;
    if (otherId) {
      await notify(otherId, { kind: "dispute_message", title: "New dispute message", body: `${req.user.username}: ${body.slice(0, 80)}`, href: `/swaps/${swap._id}`, actor: req.user._id });
    }
    res.status(201).json({
      message: {
        id: String(msg._id),
        body: msg.body,
        image: msg.image,
        author: msg.senderUsername,
        mine: true,
        createdAt: msg.createdAt,
      },
    });
  } catch (err) { next(err); }
});


/**
 * GET /api/me/swaps/:id/messages — paginated transcript (newest page first).
 * Cursor pagination: pass `before` (a message id) to load older messages.
 * Returns items in ascending order plus `hasMore` / `nextCursor` for
 * infinite scrolling backwards through long negotiations.
 */
router.get("/swaps/:id/messages", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;

    const { before, limit } = z
      .object({
        before: z.string().refine(mongoose.isValidObjectId, "Invalid cursor").optional(),
        limit: z.coerce.number().int().min(1).max(100).optional().default(30),
      })
      .parse(req.query);

    const filter = { swap: swap._id };
    if (before) filter._id = { $lt: new mongoose.Types.ObjectId(before) };

    // Fetch one extra to detect whether older messages remain.
    const page = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const items = slice.reverse();

    // Everything the counterparty sent that this member can now see is read.
    const now = new Date();
    const marked = await Message.updateMany(
      { swap: swap._id, sender: { $ne: req.user._id }, readAt: null },
      { $set: { readAt: now } },
    );
    // Let the counterparty see the read receipts live.
    if (marked.modifiedCount > 0) {
      publishSwap(swap, { type: "read", by: String(req.user._id), at: now.toISOString() });
    }

    res.json({
      items: items.map((m) => serializeMessage(m, req.user._id)),
      hasMore,
      nextCursor: hasMore && items.length ? String(items[0]._id) : null,
    });
  } catch (err) { next(err); }
});

/** POST /api/me/swaps/:id/messages/read — explicit read receipt ack. */
router.post("/swaps/:id/messages/read", async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    const now = new Date();
    const result = await Message.updateMany(
      { swap: swap._id, sender: { $ne: req.user._id }, readAt: null },
      { $set: { readAt: now } },
    );
    if (result.modifiedCount > 0) {
      publishSwap(swap, { type: "read", by: String(req.user._id), at: now.toISOString() });
    }
    res.json({ marked: result.modifiedCount ?? 0 });
  } catch (err) { next(err); }
});


/** POST /api/me/swaps/:id/messages — send a message in the negotiation.
 *  Accepts JSON ({ body }) or multipart with an optional `image` file so chat
 *  photos can be posted directly. A message needs text, an image, or both. */
router.post("/swaps/:id/messages", upload.single("image"), validateImageUpload, async (req, res, next) => {
  try {
    const swap = await loadSwapForUser(req, res);
    if (!swap) return;
    // Messaging is off after a block (either direction).
    const swapCounterparty = String(swap.requester?._id ?? swap.requester) === String(req.user._id)
      ? (swap.owner?._id ?? swap.owner)
      : (swap.requester?._id ?? swap.requester);
    if (swapCounterparty && String(swapCounterparty) !== String(req.user._id)) {
      const other = await User.findById(swapCounterparty).select("blockedUsers");
      if (other && areBlocked(other, req.user)) {
        return res.status(403).json({ error: "You can't message this user" });
      }
    }
    const body = String(req.body?.body ?? "").trim();
    let image = "";
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer);
      image = result.public_id;
    }
    if (!body && !image) return res.status(400).json({ error: "Message text or an image is required" });
    if (body.length > 1000) return res.status(400).json({ error: "Message is too long" });

    const message = await Message.create({
      swap: swap._id,
      conversation: swap.conversation,
      sender: req.user._id,
      senderUsername: req.user.username,
      kind: "text",
      body,
      image,
    });
    await Conversation.updateOne({ _id: swap.conversation }, { $set: { lastMessageAt: new Date() } });

    publishSwap(swap, { type: "message" });

    // Offline counterparty still hears about it: in-app notification + web push.
    const counterpartyId = swapCounterparty;
    if (counterpartyId && String(counterpartyId) !== String(req.user._id)) {
      const ok = await notify(counterpartyId, {
        kind: "message",
        title: `New message from ${req.user.displayName || req.user.username}`,
        body,
        href: `/swaps/${swap._id}`,
        actor: req.user._id,
      });
      if (ok) void pushToUser(counterpartyId, { title: "Swapt · New message", body, href: `/swaps/${swap._id}` });
    }

    res.status(201).json({ message: serializeMessage(message, req.user._id) });
  } catch (err) { next(err); }
});

// ---- Conversations (one chat thread per member pair) ----------------------

/** Load a conversation the signed-in member belongs to, or respond 404/403. */
async function loadConversationForUser(req, res) {
  if (!mongoose.isValidObjectId(req.params.id)) {
    res.status(404).json({ error: "Conversation not found" });
    return null;
  }
  const conv = await Conversation.findById(req.params.id);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return null;
  }
  const mine = (conv.members || []).some((m) => String(m) === String(req.user._id));
  if (!mine) {
    res.status(403).json({ error: "Not your conversation" });
    return null;
  }
  return conv;
}

/** DELETE /api/me/conversations/:id — hide this chat from the member's list.
 *  The thread and its messages stay intact for the other member. */
router.delete("/conversations/:id", async (req, res, next) => {
  try {
    const conv = await loadConversationForUser(req, res);
    if (!conv) return;

    if (!(conv.hiddenFor || []).some((h) => String(h) === String(req.user._id))) {
      conv.hiddenFor = [...(conv.hiddenFor || []), req.user._id];
      await conv.save();
    }
    res.json({ deleted: true, conversationId: String(conv._id) });
  } catch (err) { next(err); }
});

/** GET /api/me/conversations/:id/messages — the whole thread across swaps. */
router.get("/conversations/:id/messages", async (req, res, next) => {
  try {
    const conv = await loadConversationForUser(req, res);
    if (!conv) return;

    const { before, limit } = z
      .object({
        before: z.string().refine(mongoose.isValidObjectId, "Invalid cursor").optional(),
        limit: z.coerce.number().int().min(1).max(100).optional().default(30),
      })
      .parse(req.query);

    const filter = { conversation: conv._id };
    if (before) filter._id = { $lt: new mongoose.Types.ObjectId(before) };

    // Fetch one extra to detect whether older messages remain.
    const page = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1);
    const hasMore = page.length > limit;
    const slice = hasMore ? page.slice(0, limit) : page;
    const items = slice.reverse();

    // Everything the counterparty sent across the conversation is now read.
    const now = new Date();
    const marked = await Message.updateMany(
      { conversation: conv._id, sender: { $ne: req.user._id }, readAt: null },
      { $set: { readAt: now } },
    );
    if (marked.modifiedCount > 0) {
      void publishConversation(conv._id, { type: "read", by: String(req.user._id), at: now.toISOString() });
    }

    // The other member's summary so a plain (swap-less) thread can render its
    // header — swap threads already get this from the swap record.
    const otherId = (conv.members || []).find((m) => String(m) !== String(req.user._id));
    let other = null;
    if (otherId) {
      const otherDoc = await User.findById(otherId).select("username displayName avatar").lean();
      other = otherDoc
        ? {
            username: otherDoc.username,
            name: otherDoc.displayName || otherDoc.username || "Member",
            avatarUrl: otherDoc.avatar?.publicId ? signedUrl(otherDoc.avatar.publicId) : (otherDoc.avatar?.url ?? null),
          }
        : null;
    }

    res.json({
      items: items.map((m) => serializeMessage(m, req.user._id)),
      hasMore,
      nextCursor: hasMore && items.length ? String(items[0]._id) : null,
      other,
    });
  } catch (err) { next(err); }
});

/** POST /api/me/conversations/:id/messages/read — ack the whole thread. */
router.post("/conversations/:id/messages/read", async (req, res, next) => {
  try {
    const conv = await loadConversationForUser(req, res);
    if (!conv) return;
    const now = new Date();
    const result = await Message.updateMany(
      { conversation: conv._id, sender: { $ne: req.user._id }, readAt: null },
      { $set: { readAt: now } },
    );
    if (result.modifiedCount > 0) {
      void publishConversation(conv._id, { type: "read", by: String(req.user._id), at: now.toISOString() });
    }
    res.json({ marked: result.modifiedCount ?? 0 });
  } catch (err) { next(err); }
});

/** Shape a conversation for the member's inbox (swap chats + plain-text). */
async function serializeConversation(conv, userId) {
  const otherId = (conv.members || []).find((m) => String(m) !== String(userId));
  const other = otherId
    ? await User.findById(otherId).select("username displayName avatar").lean()
    : null;
  const last = await Message.findOne({ conversation: conv._id }).sort({ createdAt: -1 }).lean();
  const unread = await Message.countDocuments({
    conversation: conv._id,
    sender: { $ne: userId },
    readAt: null,
  });
  // The newest swap in the thread, so swap chats deep-link to their thread page.
  const swap = await Swap.findOne({ conversation: conv._id }).sort({ createdAt: -1 }).select("_id").lean();
  return {
    id: String(conv._id),
    counterparty: {
      id: other?._id ? String(other._id) : null,
      username: other?.username ?? "",
      name: other?.displayName || other?.username || "Member",
      avatarUrl: other?.avatar?.publicId ? signedUrl(other.avatar.publicId) : (other?.avatar?.url ?? null),
    },
    lastMessage: last ? serializeMessage(last, userId) : null,
    unreadCount: unread,
    swapId: swap ? String(swap._id) : null,
    lastMessageAt: (conv.lastMessageAt ?? last?.createdAt ?? null) ? (conv.lastMessageAt ?? last?.createdAt).toISOString() : null,
  };
}

/** GET /api/me/conversations — the member's chat inbox. Swap threads and plain
 *  text chats (no swap yet) both live here, so a "just say hi" message from a
 *  seller page isn't invisible after it's sent. */
router.get("/conversations", async (req, res, next) => {
  try {
    // Backfill: older swaps created before conversations existed have conversation: null and would never appear in the inbox.
    // Creating the shared thread here makes the Messages page consistent with Swap history (which shows those swaps).
    const missingSwaps = await Swap.find({ $or: [{ requester: req.user._id }, { owner: req.user._id }], conversation: null }).select("requester owner").lean();
    for (const s of missingSwaps) {
      try {
        const conv = await conversationBetween(s.requester, s.owner);
        await Swap.updateOne({ _id: s._id }, { $set: { conversation: conv._id } });
        await Message.updateMany({ swap: s._id, conversation: null }, { $set: { conversation: conv._id } });
      } catch (e) { /* ignore backfill errors */ }
    }

    // Keep message box in sync with swap history: don't hard-hide deleted threads here.
    // Hidden threads are still returned so the Messages page never looks empty when a chat exists.
    // The frontend can show a muted style if needed, and the delete action can be re-enabled by adding hiddenFor filter.
    const convs = await Conversation.find({
      members: req.user._id,
    })
      .sort({ lastMessageAt: -1 })
      .limit(200)
      .lean();

    // Previously this hid any thread where the other member blocked you or was blocked by you — that made
    // legitimate chats disappear from the inbox with no way to unhide them. We now keep the thread visible
    // and let the frontend show a "blocked" badge instead, so the message box never looks empty when a chat exists.
    // If you still want hard-hide, re-enable the filter below.
    // const blockedViewer = await User.find({ blockedUsers: req.user._id }).select("_id");
    // const blockedIds = new Set([...(req.user.blockedUsers || []).map((b) => String(b)), ...blockedViewer.map((u) => String(u._id))]);
    // const visible = convs.filter((c) => !(c.members || []).some((m) => blockedIds.has(String(m)) && String(m) !== String(req.user._id)));
    const visible = convs;

    const items = [];
    for (const conv of visible) {
      items.push(await serializeConversation(conv, req.user._id));
    }
    // Ensure even conversations with no lastMessageAt (old data) still surface — fall back to createdAt.
    items.sort((a, b) => {
      const atA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const atB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return atB - atA;
    });
    res.json({ items });
  } catch (err) { next(err); }
});

/** POST /api/me/conversations — start a plain-text chat with another member.
 *  No swap is created; this is how a buyer says "hi, is it available?" before
 *  committing to a proposal. `to` accepts a username or user id. */
router.post("/conversations", async (req, res, next) => {
  try {
    const { to, body } = z
      .object({
        to: z.string().trim().min(1).max(64),
        body: z.string().trim().min(1).max(1000),
      })
      .parse(req.body);

    let recipient = await User.findOne({ username: to }).select("_id username displayName blockedUsers");
    if (!recipient && mongoose.isValidObjectId(to)) {
      recipient = await User.findById(to).select("_id username displayName blockedUsers");
    }
    if (!recipient) return res.status(404).json({ error: "User not found" });
    if (String(recipient._id) === String(req.user._id)) {
      return res.status(400).json({ error: "You can't message yourself" });
    }
    if (areBlocked(recipient, req.user)) {
      return res.status(403).json({ error: "You can't message this user" });
    }

    const conv = await conversationBetween(req.user._id, recipient._id);
    // Sending again re-opens a thread this member had hidden from their inbox.
    if ((conv.hiddenFor || []).some((h) => String(h) === String(req.user._id))) {
      conv.hiddenFor = conv.hiddenFor.filter((h) => String(h) !== String(req.user._id));
      await conv.save();
    }

    const message = await Message.create({
      conversation: conv._id,
      swap: null,
      sender: req.user._id,
      senderUsername: req.user.username,
      kind: "text",
      body,
    });
    await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessageAt: new Date() } });

    await publishConversation(conv._id, { type: "message" });

    const ok = await notify(recipient._id, {
      kind: "message",
      title: `New message from ${req.user.displayName || req.user.username}`,
      body,
      href: `/messages/${conv._id}`,
      actor: req.user._id,
    });
    if (ok) void pushToUser(recipient._id, { title: "Swapt · New message", body, href: `/messages/${conv._id}` });

    res.status(201).json({ conversationId: String(conv._id), message: serializeMessage(message, req.user._id) });
  } catch (err) { next(err); }
});

/** POST /api/me/conversations/:id/messages — send to the shared thread.
 *  Accepts JSON ({ body }) or multipart with an optional `image` file. */
router.post("/conversations/:id/messages", upload.single("image"), validateImageUpload, async (req, res, next) => {
  try {
    const conv = await loadConversationForUser(req, res);
    if (!conv) return;
    // Messaging is off after a block (either direction).
    const convOtherId = (conv.members || []).find((m) => String(m) !== String(req.user._id));
    if (convOtherId) {
      const other = await User.findById(convOtherId).select("blockedUsers");
      if (other && areBlocked(other, req.user)) {
        return res.status(403).json({ error: "You can't message this user" });
      }
    }
    const body = String(req.body?.body ?? "").trim();
    let image = "";
    if (req.file) {
      const result = await uploadBuffer(req.file.buffer);
      image = result.public_id;
    }
    if (!body && !image) return res.status(400).json({ error: "Message text or an image is required" });
    if (body.length > 1000) return res.status(400).json({ error: "Message is too long" });

    // Attach to the most recent swap in the conversation when one exists —
    // plain-text chats (no swap yet) still work, their messages just carry no
    // swap id. Swap attachments keep notifications/realtime per-swap.
    const latest = await Swap.findOne({ conversation: conv._id }).sort({ createdAt: -1 }).select("_id requester owner");

    const message = await Message.create({
      swap: latest?._id ?? null,
      conversation: conv._id,
      sender: req.user._id,
      senderUsername: req.user.username,
      kind: "text",
      body,
      image,
    });
    await Conversation.updateOne({ _id: conv._id }, { $set: { lastMessageAt: new Date() } });

    // Notify every swap in the conversation so whichever thread is open updates.
    await publishConversation(conv._id, { type: "message" });

    const counterpartyId = (conv.members || []).find((m) => String(m) !== String(req.user._id));
    if (counterpartyId) {
      const threadHref = latest ? `/swaps/${latest._id}` : `/messages/${conv._id}`;
      const ok = await notify(counterpartyId, {
        kind: "message",
        title: `New message from ${req.user.displayName || req.user.username}`,
        body,
        href: threadHref,
        actor: req.user._id,
      });
      if (ok) void pushToUser(counterpartyId, { title: "Swapt · New message", body, href: threadHref });
    }

    res.status(201).json({ message: serializeMessage(message, req.user._id) });
  } catch (err) { next(err); }
});

// ---- Saved searches + alerts -----------------------------------------------

function serializeSavedSearch(doc) {
  return {
    id: String(doc._id),
    name: doc.name || "",
    q: doc.q || "",
    cat: doc.cat || "",
    size: doc.size || "",
    g: doc.g || "",
    brand: doc.brand || "",
    tag: doc.tag || "",
    lat: doc.lat ?? null,
    lng: doc.lng ?? null,
    radiusKm: doc.radiusKm ?? null,
    meetupOnly: Boolean(doc.meetupOnly),
    alertsEnabled: Boolean(doc.alertsEnabled),
    lastAlertAt: doc.lastAlertAt ? doc.lastAlertAt.toISOString() : null,
    createdAt: doc.createdAt.toISOString(),
  };
}

/** GET /api/me/saved-searches — this member's bookmarked searches. */
router.get("/saved-searches", async (req, res, next) => {
  try {
    const items = await SavedSearch.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ items: items.map(serializeSavedSearch) });
  } catch (err) { next(err); }
});

/** POST /api/me/saved-searches — save the current browse query. */
router.post("/saved-searches", async (req, res, next) => {
  try {
    const data = savedSearchSchema.parse(req.body);
    const search = await SavedSearch.create({ user: req.user._id, ...data });
    res.status(201).json({ search: serializeSavedSearch(search) });
  } catch (err) { next(err); }
});

/** PATCH /api/me/saved-searches/:id — rename / toggle alerts. */
router.patch("/saved-searches/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Search not found" });
    const search = await SavedSearch.findOne({ _id: req.params.id, user: req.user._id });
    if (!search) return res.status(404).json({ error: "Search not found" });
    const data = savedSearchSchema.partial().parse(req.body);
    Object.assign(search, data);
    await search.save();
    res.json({ search: serializeSavedSearch(search) });
  } catch (err) { next(err); }
});

/** DELETE /api/me/saved-searches/:id */
router.delete("/saved-searches/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Search not found" });
    await SavedSearch.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Web push subscriptions -------------------------------------------------

/** POST /api/me/push-subscriptions — register (or refresh) a browser push sub. */
router.post("/push-subscriptions", async (req, res, next) => {
  try {
    const data = z
      .object({
        endpoint: z.string().url().max(512),
        keys: z.object({
          p256dh: z.string().min(1),
          auth: z.string().min(1),
        }),
      })
      .parse(req.body);

    const sub = await PushSubscription.findOneAndUpdate(
      { user: req.user._id, endpoint: data.endpoint },
      { user: req.user._id, endpoint: data.endpoint, keys: data.keys, userAgent: (req.headers["user-agent"] || "").slice(0, 255) },
      { upsert: true, new: true },
    );
    res.status(201).json({ ok: true, id: String(sub._id) });
  } catch (err) { next(err); }
});

/** DELETE /api/me/push-subscriptions/:id — forget a subscription by its id. */
router.delete("/push-subscriptions/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Subscription not found" });
    await PushSubscription.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** DELETE /api/me/push-subscriptions — forget a subscription by endpoint. */
router.delete("/push-subscriptions", async (req, res, next) => {
  try {
    const { endpoint } = z.object({ endpoint: z.string().url().max(512) }).parse(req.body);
    await PushSubscription.findOneAndDelete({ user: req.user._id, endpoint });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---- Pending-swap auto-expiry --------------------------------------------------
// Unanswered requests are cancelled after a week so stale offers don't linger
// in the dashboard. The sweeper wakes up every minute but only touches swaps
// that have actually crossed their deadline. Started by server.js after the
// DB connection is up (no-op before that).

let expiryTimer = null;

async function expirePendingSwaps() {
  if (mongoose.connection.readyState !== 1) return 0;
  const now = new Date();
  const expired = await Swap.find({ status: "pending", expiresAt: { $ne: null, $lte: now } })
    .select("_id requester owner expiresAt")
    .populate("requester", "username displayName email accent")
    .populate("owner", "username displayName email accent");

  for (const swap of expired) {
    const expiry = swap.expiresAt;
    // Conditional update — a swap that was accepted between the query and this
    // write is left untouched (no clobbering a live negotiation).
    const cancelled = await Swap.findOneAndUpdate(
      { _id: swap._id, status: "pending" },
      { $set: { status: "cancelled", expiresAt: null } },
      { new: true },
    ).catch((err) => {
      console.error("[swap] expiry save failed", err.message);
      return null;
    });
    if (!cancelled) continue;

    await systemNote(cancelled._id, "This swap request expired after 7 days and was cancelled.");

    const counterpartyName =
      swap.requester?.displayName || swap.requester?.username || "the other member";
    publishSwap(cancelled, { type: "status", status: "cancelled" });
    for (const member of [swap.requester, swap.owner]) {
      if (member?._id) {
        const isRequester = String(member._id) === String(swap.requester._id);
        void notify(member._id, {
          kind: "message",
          title: "Swap request expired",
          body: isRequester
            ? `Your swap request from ${expiry ? new Date(expiry).toLocaleDateString() : ""} was cancelled after 7 days without a reply.`
            : `The swap request with ${counterpartyName} expired after 7 days and was cancelled.`,
          href: `/swaps/${cancelled._id}`,
        });
        if (member.email) void sendSwapExpiredEmail(member.email, { swapId: String(cancelled._id), accent: member.accent || "red" }).catch(()=>{});
      }
    }
  }
  return expired.length;
}

/** Start (or restart) the pending-swap expiry sweep. Safe to call repeatedly. */
export function startSwapExpirySweeper(intervalMs = 60_000) {
  if (expiryTimer) clearInterval(expiryTimer);
  expiryTimer = setInterval(() => { void expirePendingSwaps(); }, intervalMs);
  return expiryTimer;
}

export default router;