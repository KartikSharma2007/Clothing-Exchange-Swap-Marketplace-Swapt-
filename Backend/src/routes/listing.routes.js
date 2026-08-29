import { Router } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { Listing } from "../models/Listing.js";
import { Swap } from "../models/Swap.js";
import { Wishlist } from "../models/Wishlist.js";
import { ListingView } from "../models/ListingView.js";
import { SavedSearch } from "../models/SavedSearch.js";
import { User } from "../models/User.js";
import { Watch } from "../models/Watch.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { getSiteConfig } from "../models/SiteConfig.js";
import { upload, uploadListingImages, validateImageUpload } from "../middleware/upload.js";
import { destroyAsset, signedUrl, uploadBuffer } from "../config/cloudinary.js";
import { listQuerySchema, listingSchema, draftListingSchema, toListingDoc } from "../utils/validators.js";
import { notify } from "../utils/notify.js";
import { pushToUser } from "../utils/push.js";
import { computeFit } from "../utils/fit.js";
import { suggestListingFromImage } from "../utils/ai.js";
import { moderateListing } from "../utils/moderation.js";

/**
 * Find members with a saved search that this brand-new listing matches, then
 * notify them (and push if their browser is subscribed). Fired once when an
 * item is listed. Reuses the list-filter semantics so alerts behave exactly
 * like the browse page would.
 */
async function notifySavedSearchMatches(listing) {
  try {
    const searches = await SavedSearch.find({ alertsEnabled: true }).lean();
    const matches = searches.filter((s) => {
      if (String(s.user) === String(listing.seller)) return false;
      const inQ = (field) => {
        if (!s[field]) return true;
        return String(listing[field] ?? "").toLowerCase() === String(s[field]).toLowerCase();
      };
      if (s.cat && listing.category !== s.cat) return false;
      if (s.size && listing.size !== s.size) return false;
      if (s.g && listing.gender !== s.g) return false;
      if (s.brand && String(listing.brand).toLowerCase() !== String(s.brand).toLowerCase()) return false;
      if (s.tag === "sports" && !SPORTS_BRANDS.some((b) => String(b).toLowerCase() === String(listing.brand).toLowerCase())) return false;
      if (s.q) {
        const rx = new RegExp(s.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        if (!rx.test(listing.title) && !rx.test(listing.brand) && !rx.test(listing.color)) return false;
      }
      // Location scope: skip items outside the search's radius / non-meetup items.
      if (s.meetupOnly && !listing.meetup) return false;
      if (typeof s.lat === "number" && typeof s.lng === "number") {
        const coords = listing.locationCoord?.coordinates;
        if (!coords) return false;
        const [ilng, ilat] = coords;
        if (haversineKm(s.lng, s.lat, ilng, ilat) > (s.radiusKm ?? 50)) return false;
      }
      return true;
    });

    for (const s of matches) {
      // Throttle: at most one alert per search per day.
      if (s.lastAlertAt && Date.now() - new Date(s.lastAlertAt).getTime() < 86400000) continue;
      const ok = await notify(s.user, {
        kind: "search_alert",
        title: "New match for your saved search",
        body: `“${listing.title}” matches “${s.name || savedSearchLabel(s)}”.`,
        href: `/listing/${listing._id}`,
        actor: null,
      });
      if (ok) void pushToUser(s.user, {
        title: "Swapt · New match",
        body: `“${listing.title}” — ${s.name || savedSearchLabel(s)}`,
        href: `/listing/${listing._id}`,
      });
      await SavedSearch.updateOne({ _id: s._id }, { lastAlertAt: new Date() });
    }
  } catch (err) {
    console.warn("saved-search alerts failed", err.message || err);
  }
}

function savedSearchLabel(s) {
  return [s.brand, s.cat, s.g, s.size ? `Size ${s.size}` : ""].filter(Boolean).join(" · ") || "your search";
}

const router = Router();
router.use(optionalAuth);

/** Whether a listing is currently effectively featured (respects expiry — admin featured without expiry stays featured). */
function isEffectivelyFeatured(doc) {
  if (!doc.featured) return false;
  if (!doc.featuredUntil) return true; // admin featured: no expiry
  return new Date(doc.featuredUntil).getTime() > Date.now();
}

/** Lazily expire stale self-serve boosts (expired featuredUntil) so browse never shows them top-ranked. */
async function expireStaleBoosts() {
  try {
    await Listing.updateMany(
      { featured: true, featuredUntil: { $lte: new Date() } },
      { $set: { featured: false } },
    );
  } catch {}
}

/** Auto-publish scheduled listings when publishAt passes. */
async function sweepScheduledListings() {
  try {
    if (Listing.db.readyState !== 1) return 0;
    const now = new Date();
    const due = await Listing.find({ status: "scheduled", publishAt: { $lte: now } }).limit(50);
    let count = 0;
    for (const l of due) {
      if (!l.images?.length) continue; // keep scheduled until photo added
      const mod = moderateListing({ title: l.title, brand: l.brand, description: l.description, tags: l.tags });
      l.moderationScore = mod.score;
      l.moderationReason = mod.reasons.join("; ");
      if (mod.flagged) {
        l.moderationStatus = "flagged";
        l.flaggedAt = new Date();
        // Keep as scheduled flagged — admin must approve; we don't publish flagged
        await l.save();
        continue;
      }
      l.moderationStatus = "approved";
      l.status = "active";
      l.publishAt = null;
      await l.save();
      void notifySavedSearchMatches(l);
      count += 1;
    }
    return count;
  } catch { return 0; }
}

let scheduledTimer = null;
export function startScheduledPublishSweeper(intervalMs = 60_000) {
  if (scheduledTimer) clearInterval(scheduledTimer);
  scheduledTimer = setInterval(() => { void sweepScheduledListings(); }, intervalMs);
  return scheduledTimer;
}

function serialize(doc, viewer = null) {
  const seller = doc.seller && doc.seller.username
    ? {
        id: String(doc.seller._id),
        name: doc.seller.displayName || doc.seller.username,
        username: doc.seller.username,
        rating: doc.seller.rating,
        swaps: doc.seller.swaps,
        reliability: doc.seller.reliability ?? null,
        reliabilitySample: doc.seller.reliabilitySample ?? 0,
        avatarUrl: doc.seller.avatar?.url ?? null,
      }
    : { id: String(doc.seller), name: "Swapt member", username: "", rating: 0, swaps: 0, reliability: null, reliabilitySample: 0, avatarUrl: null };

  const effectiveFeatured = isEffectivelyFeatured(doc);
  const data = {
    id: String(doc._id),
    title: doc.title,
    brand: doc.brand,
    description: doc.description,
    category: doc.category,
    gender: doc.gender,
    size: doc.size,
    condition: doc.condition,
    color: doc.color,
    value: doc.value,
    location: doc.location,
    retailValue: doc.retailValue ?? undefined,
    material: doc.material || undefined,
    fit: doc.fit || undefined,
    style: doc.style || undefined,
    pattern: doc.pattern || undefined,
    season: doc.season || undefined,
    care: doc.care || undefined,
    shippingDays: doc.shippingDays || undefined,
    swapPreferences: doc.swapPreferences || undefined,
    quantity: doc.quantity ?? 1,
    meetup: Boolean(doc.meetup),
    lat: doc.locationCoord?.coordinates?.[1] ?? undefined,
    lng: doc.locationCoord?.coordinates?.[0] ?? undefined,
    tags: doc.tags ?? [],
    measurements: doc.measurements ? { ...(doc.measurements.toObject?.() ?? doc.measurements) } : undefined,
    shipsFrom: doc.location || undefined,
    views: doc.views ?? 0,
    saves: doc.saves ?? 0,
    status: doc.status,
    publishAt: doc.publishAt ? new Date(doc.publishAt).toISOString() : null,
    featured: effectiveFeatured,
    featuredUntil: doc.featuredUntil ? new Date(doc.featuredUntil).toISOString() : null,
    boostCount: doc.boostCount ?? 0,
    moderationStatus: doc.moderationStatus ?? "approved",
    moderationReason: doc.moderationReason ?? "",
    moderationScore: doc.moderationScore ?? 0,
    returnWindowDays: doc.returnWindowDays ?? 7,
    returnPolicy: doc.returnPolicy ?? "",
    // Signed, expiring URLs — Cloudinary assets stay private.
    images: doc.images.map((img) => signedUrl(img.publicId)),
    // PublicIds mirror the `images` array 1:1 so the owner can reorder / pick a cover.
    imageIds: doc.images.map((img) => img.publicId),
    seller,
    createdAt: doc.createdAt,
    postedDaysAgo: Math.max(0, Math.floor((Date.now() - new Date(doc.createdAt).getTime()) / 86400000)),
    // "Likely fits you" — computed against the viewer's saved measurements.
    likelyFit: false,
    fitDetails: null,
  };

  if (viewer) {
    const fit = computeFit(viewer, doc);
    if (fit) {
      data.likelyFit = fit.likelyFit;
      data.fitDetails = fit;
    }
  }

  return data;
}

/** One-line explanation of why a candidate appeared under "You may also like". */
function relatedLabel(candidate, base) {
  const norm = (v) => String(v || "").toLowerCase().trim();
  const sameBrand = candidate.brand && norm(candidate.brand) === norm(base.brand);
  const sameCategory = candidate.category && norm(candidate.category) === norm(base.category);
  const sameDepartment = candidate.gender && norm(candidate.gender) === norm(base.gender);
  const sameSize = candidate.size && norm(candidate.size) === norm(base.size);
  const a = norm(candidate.color), b = norm(base.color);
  const similarColor = Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
  if (sameBrand) return "Same brand";
  if (sameCategory) return "Same category";
  if (similarColor) return "Similar colour";
  if (sameDepartment) return "Same department";
  if (sameSize) return "Same size";
  return "Similar items";
}

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  "value-asc": { value: 1 },
  "value-desc": { value: -1 },
  "most-saved": { saves: -1, createdAt: -1 },
  "most-viewed": { views: -1, createdAt: -1 },
};

/** Great-circle distance in km between two [lng, lat] points (haversine). */
function haversineKm(lng1, lat1, lng2, lat2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Brands treated as "sportswear" for the Sports nav section. */
const SPORTS_BRANDS = ["Nike", "Adidas", "Patagonia", "The North Face", "Puma", "Under Armour", "Vans", "New Balance", "Reebok"];

/** GET /api/listings — search, filter, sort, paginate. */
router.get("/", async (req, res, next) => {
  try {
    await expireStaleBoosts();
    const { q, cat, size, condition, g, brand, tag, sort, page, limit, lat, lng, radiusKm, meetupOnly, minValue, maxValue } = listQuerySchema.parse(req.query);

    // Only approved active listings are discoverable — draft/scheduled/flagged are hidden until published/approved.
    const filter = { status: "active", moderationStatus: { $nin: ["flagged", "rejected", "pending"] } };
    // Categories switched off by admins are undiscoverable (but still viewable
    // via a direct link once a swap is already in flight).
    const site = await getSiteConfig();
    const disabled = site?.disabledCategories ?? [];
    if (disabled.length) {
      filter.category = cat ? { $in: [cat], $nin: disabled } : { $nin: disabled };
    } else if (cat) {
      filter.category = cat;
    }
    if (size) filter.size = size;
    if (condition) filter.condition = condition;
    if (g) {
      // Departments "Womens" and "Mens" also surface Unisex items, matching
      // the demo/mock behaviour — a unisex piece fits either way.
      filter.gender = g === "Kids" ? g : { $in: [g, "Unisex"] };
    }
    if (brand) filter.brand = new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    if (tag === "sports") filter.brand = { $in: SPORTS_BRANDS.map((b) => new RegExp(`^${b}$`, "i")) };
    if (tag === "trending") filter.createdAt = { $gte: new Date(Date.now() - 7 * 86400000) };
    if (tag === "sale") filter.value = { $lte: 25 };
    if (meetupOnly) filter.meetup = true;
    if (typeof minValue === "number" || typeof maxValue === "number") {
      // Merge with any existing value constraint (e.g. the "sale" tag filter).
      const v = { ...(filter.value || {}) };
      if (typeof minValue === "number") v.$gte = minValue;
      if (typeof maxValue === "number") v.$lte = maxValue;
      filter.value = v;
    }
    const rx = q ? new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") : null;
    if (q) {
      filter.$or = [{ title: rx }, { brand: rx }, { color: rx }];
    }

    // Blocked-user filtering belongs in the query (not post-pagination) so the
    // count and page size stay accurate. Exclude listings whose seller is
    // blocked by the viewer, or who has blocked the viewer.
    if (req.user) {
      const blockedViewer = await User.find({ blockedUsers: req.user._id }).select("_id");
      filter.seller = { $nin: [...(req.user.blockedUsers || []), ...blockedViewer.map((u) => u._id)] };
    }

    // Location filter: keep items within a radius of (lat, lng).
    const hasCoords = typeof lat === "number" && typeof lng === "number";
    if (hasCoords) {
      const maxDistance = (radiusKm ?? 50) * 1000; // km -> meters
      filter.locationCoord = { $geoWithin: { $centerSphere: [[lng, lat], maxDistance / 6371000] } };
    }

    // "nearest" is a distance sort — use $nearSphere (auto distance order).
    const nearest = hasCoords && sort === "nearest";
    // "relevance" without a search term behaves exactly like "newest".
    const effectiveSort = sort === "relevance" && !q ? "newest" : sort;
    const useAggregate = effectiveSort === "top-rated" || effectiveSort === "relevance";

    let items;
    const total = await Listing.countDocuments(filter);
    if (useAggregate) {
      const skip = (page - 1) * limit;
      // Title/description/tags concatenated so $regexMatch has a single string.
      const textField = {
        $concat: [
          { $ifNull: ["$description", ""] },
          " ",
          { $ifNull: [{ $reduce: { input: "$tags", initialValue: "", in: { $concat: ["$$value", " ", "$$this"] } } }, ""] },
        ],
      };
      const pipeline =
        effectiveSort === "top-rated"
          ? [
              { $match: filter },
              { $lookup: { from: "users", localField: "seller", foreignField: "_id", as: "sellerDoc" } },
              { $addFields: { _score: { $ifNull: [{ $first: "$sellerDoc.rating" }, 0] } } },
              { $sort: { featured: -1, _score: -1, createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
            ]
          : [
              { $match: filter },
              { $lookup: { from: "users", localField: "seller", foreignField: "_id", as: "sellerDoc" } },
              {
                $addFields: {
                  _score: {
                    $add: [
                      { $cond: [{ $regexMatch: { input: "$title", regex: rx } }, 12, 0] },
                      { $cond: [{ $regexMatch: { input: "$brand", regex: rx } }, 10, 0] },
                      { $cond: [{ $regexMatch: { input: "$color", regex: rx } }, 6, 0] },
                      { $cond: [{ $regexMatch: { input: textField, regex: rx } }, 4, 0] },
                      { $min: [3, { $divide: [{ $add: ["$views", { $multiply: ["$saves", 3] }] }, 300] }] },
                    ],
                  },
                },
              },
              { $sort: { featured: -1, _score: -1, createdAt: -1 } },
              { $skip: skip },
              { $limit: limit },
            ];
      items = await Listing.aggregate(pipeline);
      // The $lookup hands us the seller doc directly — give it to serialize.
      items.forEach((d) => { d.seller = d.sellerDoc?.[0] ?? null; delete d.sellerDoc; });
    } else {
      items = await Listing.find(nearest
        ? { ...filter, locationCoord: { $nearSphere: { $geometry: { type: "Point", coordinates: [lng, lat] }, $maxDistance: (radiusKm ?? 50) * 1000 } } }
        : filter)
        .sort(nearest ? {} : { featured: -1, ...(SORTS[effectiveSort] || { createdAt: -1 }) })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("seller", "username displayName rating swaps reliability reliabilitySample avatar blockedUsers");
    }

    // Annotate distance when browsing by location so the UI can show "12 km away".
    const out = items.map((item) => {
      const data = serialize(item, req.user);
      if (hasCoords && item.locationCoord?.coordinates) {
        const [ilng, ilat] = item.locationCoord.coordinates;
        data.distanceKm = Math.round(haversineKm(lng, lat, ilng, ilat) * 10) / 10;
      }
      return data;
    });

    res.json({ items: out, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (err) { next(err); }
});

/** GET /api/listings/facets — filter options with counts (only approved active). */
router.get("/facets", async (_req, res, next) => {
  try {
    const site = await getSiteConfig();
    const disabled = site?.disabledCategories ?? [];
    const baseActive = { status: "active", moderationStatus: { $nin: ["flagged", "rejected", "pending"] } };
    const activeMatch = disabled.length
      ? { ...baseActive, category: { $nin: disabled } }
      : baseActive;
    const [categories, sizes, brands] = await Promise.all([
      Listing.aggregate([{ $match: activeMatch }, { $group: { _id: "$category", count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Listing.aggregate([{ $match: activeMatch }, { $group: { _id: "$size", count: { $sum: 1 } } }]),
      Listing.aggregate([
        { $match: { ...activeMatch, brand: { $nin: [null, ""] } } },
        { $group: { _id: "$brand", count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);
    res.json({
      categories: categories.map((c) => ({ value: c._id, count: c.count })),
      sizes: sizes.map((s) => ({ value: s._id, count: s.count })),
      brands: brands.map((b) => ({ value: b._id, count: b.count })),
    });
  } catch (err) { next(err); }
});

/** POST /api/listings/ai-suggest — vision model fills listing fields from a photo. */
router.post("/ai-suggest", requireAuth, upload.single("image"), validateImageUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image was uploaded." });
    const suggestion = await suggestListingFromImage({ buffer: req.file.buffer, mimeType: req.file.mimetype });
    res.json({ suggestion });
  } catch (err) {
    if (err && err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

/** GET /api/listings/:id — does NOT increment views (see POST /:id/view). */
router.get("/:id", async (req, res, next) => {
  try {
    await expireStaleBoosts();
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    const listing = await Listing.findById(req.params.id).populate("seller", "username displayName rating swaps reliability reliabilitySample avatar blockedUsers");
    if (!listing || listing.status === "hidden") return res.status(404).json({ error: "Listing not found" });
    if (isEffectivelyFeatured(listing) !== Boolean(listing.featured) && listing.featured && listing.featuredUntil && new Date(listing.featuredUntil).getTime() <= Date.now()) {
      listing.featured = false;
      await listing.save().catch(()=>{});
    }
    // Proactive moderation: flagged/rejected listings hidden from non-owners (except admins). Seller can still see their own flagged draft via dashboard.
    if (listing.moderationStatus === "flagged" || listing.moderationStatus === "rejected") {
      const isOwner = req.user && String(listing.seller?._id ?? listing.seller) === String(req.user._id);
      const isAdmin = req.user?.role === "admin";
      if (!isOwner && !isAdmin) return res.status(404).json({ error: "Listing not found" });
    }
    // Draft/scheduled only visible to owner
    if (["draft","scheduled"].includes(listing.status)) {
      const isOwner = req.user && String(listing.seller?._id ?? listing.seller) === String(req.user._id);
      if (!isOwner) return res.status(404).json({ error: "Listing not found" });
    }
    if (req.user && listing.seller) {
      const sellerHasBlockedViewer = Array.isArray(listing.seller.blockedUsers) && listing.seller.blockedUsers.some((b) => String(b) === String(req.user._id));
      const viewerHasBlockedSeller = Array.isArray(req.user.blockedUsers) && req.user.blockedUsers.some((b) => String(b) === String(listing.seller._id));
      if (sellerHasBlockedViewer || viewerHasBlockedSeller) return res.status(404).json({ error: "Listing not found" });
    }

    // "You may also like": rank other listings by weighted similarity —
    // category, brand, colour and size are the strongest signals, department
    // and material help, and close value keeps the swap ask in a comfortable
    // range. Ties break on featured + popularity + recency.
    const site = await getSiteConfig();
    const disabled = site?.disabledCategories ?? [];
    const related = await Listing.aggregate([
      { $match: { _id: { $ne: listing._id }, status: "active", moderationStatus: { $nin: ["flagged","rejected","pending"] }, ...(disabled.length ? { category: { $nin: disabled } } : {}) } },
      {
        $addFields: {
          score: {
            $add: [
              { $cond: [{ $eq: ["$category", listing.category] }, 6, 0] },
              { $cond: [{ $eq: [{ $toLower: "$brand" }, String(listing.brand || "").toLowerCase()] }, 5, 0] },
              { $cond: [{ $eq: [{ $toLower: "$color" }, String(listing.color || "").toLowerCase()] }, 3, 0] },
              { $cond: [{ $eq: ["$gender", listing.gender] }, 2, 0] },
              { $cond: [{ $eq: ["$size", listing.size] }, 2, 0] },
              { $cond: [{ $eq: [{ $toLower: "$material" }, String(listing.material || "").toLowerCase()] }, 1, 0] },
              {
                // Closer value = stronger match: 2 points at $0 diff, 0 at ±$60.
                $max: [0, { $subtract: [2, { $divide: [{ $abs: { $subtract: ["$value", listing.value] } }, 30] }] }],
              },
              {
                // Light popularity signal so well-loved items surface early.
                $min: [2, { $divide: [{ $add: ["$views", { $multiply: ["$saves", 3] }] }, 200] }],
              },
            ],
          },
        },
      },
      { $sort: { score: -1, featured: -1, views: -1, createdAt: -1 } },
      { $limit: 8 },
    ]);
    await Listing.populate(related, { path: "seller", select: "username displayName rating swaps reliability reliabilitySample avatar blockedUsers" });
    const relatedOut = related.map((r) => ({ ...serialize(r, req.user), matchLabel: relatedLabel(r, listing) }));

    res.json({ listing: serialize(listing, req.user), related: relatedOut });
  } catch (err) { next(err); }
});

/** POST /api/listings/:id/view — the client fires this once per session. */
// The ListingView dedupe already makes re-views a no-op, but the endpoint is
// still reachable unauthenticated — cap it per IP as defence-in-depth so a
// script can't hammer the DB per listing (a real session fires it rarely).
const viewLimiter = rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false });

router.post("/:id/view", viewLimiter, optionalAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    const listing = await Listing.findById(req.params.id).select("views status");
    if (!listing || listing.status === "hidden") return res.status(404).json({ error: "Listing not found" });

    // Count each (listing, viewer) once. Without this, anonymous callers could
    // pump `views` — which feeds most-viewed / trending / relevance — by just
    // re-firing this endpoint. Signed-in members get a stable id key; anonymous
    // visitors get a hash of their address so raw IPs aren't stored.
    const viewerKey = req.user
      ? `user:${req.user._id}`
      : `ip:${crypto.createHash("sha256").update(req.ip ?? req.socket?.remoteAddress ?? "unknown").digest("hex").slice(0, 32)}`;

    let counted = false;
    try {
      await ListingView.create({ listing: listing._id, viewerKey });
      await Listing.updateOne({ _id: listing._id }, { $inc: { views: 1 } });
      counted = true;
    } catch (err) {
      // Duplicate view (unique (listing, viewerKey) index) → no-op. Re-throw
      // anything else (e.g. a DB outage) so the request surfaces a 500.
      if (err?.code !== 11000) throw err;
    }

    res.json({ views: (listing.views ?? 0) + (counted ? 1 : 0) });
  } catch (err) { next(err); }
});

/** GET /api/listings/:id/watch — check if you watch this item */
router.get("/:id/watch", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    const watch = await Watch.findOne({ user: req.user._id, listing: req.params.id });
    res.json({ watching: Boolean(watch), watch: watch ? { id: String(watch._id), lastValue: watch.lastValue, notifyPriceDrop: watch.notifyPriceDrop, notifyRestock: watch.notifyRestock } : null });
  } catch (err) { next(err); }
});

/** POST /api/listings/:id/watch — watch for price drop / restock */
router.post("/:id/watch", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    const listing = await Listing.findById(req.params.id).select("value status");
    if (!listing || listing.status === "hidden") return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) === String(req.user._id)) return res.status(400).json({ error: "You can't watch your own listing" });
    const existing = await Watch.findOne({ user: req.user._id, listing: req.params.id });
    if (existing) return res.json({ watching: true, watch: { id: String(existing._id), lastValue: existing.lastValue } });
    const watch = await Watch.create({ user: req.user._id, listing: req.params.id, lastValue: listing.value });
    res.status(201).json({ watching: true, watch: { id: String(watch._id), lastValue: watch.lastValue } });
  } catch (err) {
    if (err?.code === 11000) return res.json({ watching: true });
    next(err);
  }
});

/** DELETE /api/listings/:id/watch — unwatch */
router.delete("/:id/watch", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    await Watch.deleteOne({ user: req.user._id, listing: req.params.id });
    res.json({ watching: false });
  } catch (err) { next(err); }
});

/** POST /api/listings — multipart/form-data with `images` files.
 * Supports draft / scheduled via `status` field (draft | scheduled | active).
 * Drafts allow missing fields + no photos; scheduled requires publishAt future.
 * Proactive moderation runs synchronously and may auto-flag.
 */
router.post("/", requireAuth, uploadListingImages, validateImageUpload, async (req, res, next) => {
  let uploaded = [];
  try {
    const rawStatus = String(req.body?.status || "active").trim().toLowerCase();
    const isDraft = rawStatus === "draft";
    const isScheduled = rawStatus === "scheduled";

    let data;
    let publishAt = null;
    if (isDraft) {
      // Draft: relaxed validation; images optional; defaults applied.
      data = draftListingSchema.parse(req.body);
      if (req.body.publishAt) {
        const pa = new Date(String(req.body.publishAt));
        if (!isNaN(pa.getTime())) publishAt = pa;
      }
    } else if (isScheduled) {
      data = listingSchema.parse(req.body);
      const pa = req.body.publishAt ? new Date(String(req.body.publishAt)) : null;
      if (!pa || isNaN(pa.getTime()) || pa.getTime() <= Date.now()) {
        return res.status(400).json({ error: "Scheduled listings need a future publishAt date." });
      }
      publishAt = pa;
    } else {
      data = listingSchema.parse(req.body);
      if (req.body.publishAt) {
        const pa = new Date(String(req.body.publishAt));
        if (!isNaN(pa.getTime()) && pa.getTime() > Date.now()) publishAt = pa;
      }
    }

    const needImages = !isDraft; // drafts may have 0 images
    if (needImages && !req.files?.length) return res.status(400).json({ error: "Upload at least one photo" });

    if (req.files?.length) {
      uploaded = await Promise.all(
        req.files.map(async (file) => {
          const result = await uploadBuffer(file.buffer);
          return { publicId: result.public_id, width: result.width, height: result.height, bytes: result.bytes };
        }),
      );
    }

    // Map returnWindowDays / returnPolicy from data
    const listingDoc = toListingDoc(data);
    // Handle returnWindowDays / returnPolicy explicitly (zod default may be missing on draft)
    if (data.returnWindowDays !== undefined) listingDoc.returnWindowDays = data.returnWindowDays;
    if (data.returnPolicy !== undefined) listingDoc.returnPolicy = data.returnPolicy;

    const status = isDraft ? "draft" : isScheduled ? "scheduled" : "active";

    // Proactive moderation scan — drafts are not scanned until published; scheduled/active are scanned now.
    let moderationStatus = "approved";
    let moderationReason = "";
    let moderationScore = 0;
    let flaggedAt = null;
    if (status !== "draft") {
      const mod = moderateListing({
        title: listingDoc.title ?? data.title,
        brand: listingDoc.brand ?? data.brand,
        description: listingDoc.description ?? data.description,
        tags: listingDoc.tags ?? [],
      });
      moderationScore = mod.score;
      moderationReason = mod.reasons.join("; ");
      moderationStatus = mod.status;
      if (mod.flagged) {
        flaggedAt = new Date();
        // Auto-hide flagged items until admin review — scheduled/active both become hidden pending review? For scheduled we keep scheduled but flagged so not visible.
        // For active flagged, we hide via moderationStatus, browse already excludes flagged. No need to change status to hidden; moderationStatus gates it.
      }
    } else {
      moderationStatus = "pending"; // draft not yet moderated
    }

    const listing = await Listing.create({
      ...listingDoc,
      images: uploaded,
      seller: req.user._id,
      status,
      publishAt,
      moderationStatus,
      moderationReason,
      moderationScore,
      flaggedAt,
    });

    if (status === "active" && moderationStatus === "approved") {
      void notifySavedSearchMatches(listing);
    }
    if (moderationStatus === "flagged") {
      // Log for admin queue — audit trail
      const { recordAudit } = await import("../models/AuditLog.js");
      void recordAudit(req, {
        action: "listing.flagged",
        targetType: "listing",
        targetId: String(listing._id),
        targetLabel: listing.title,
        reason: moderationReason || "Auto-flagged by proactive moderation",
        metadata: { score: moderationScore, status },
      }).catch(()=>{});
    }

    await listing.populate("seller", "username displayName rating swaps avatar");
    res.status(201).json({ listing: serialize(listing), moderation: { status: moderationStatus, reason: moderationReason, score: moderationScore } });
  } catch (err) {
    await Promise.allSettled(uploaded.map((i) => destroyAsset(i.publicId)));
    next(err);
  }
});

/** PATCH /api/listings/:id — owner only. JSON for fields, or multipart when
 *  adding new photos (`images` files). Supports reordering (`imageOrder`) and
 *  removing (`removeImages`) photos in the same request.
 *  Also re-runs proactive moderation if title/brand/description/tags changed.
 */
router.patch("/:id", requireAuth, uploadListingImages, validateImageUpload, async (req, res, next) => {
  let uploaded = [];
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) !== String(req.user._id)) return res.status(403).json({ error: "Not your listing" });

    const prevValue = listing.value;
    const prevStatus = listing.status;
    // Use draft-lenient schema if the listing is still a draft — otherwise require full fields for partial updates
    const isDraft = listing.status === "draft";
    const schema = isDraft ? draftListingSchema.partial() : listingSchema.partial();
    const data = schema.parse(req.body);
    const { lat, lng, tags, imageOrder, removeImages, publishAt, returnWindowDays, returnPolicy, ...rest } = data;
    // Prevent direct status mutation via PATCH — use publish/schedule endpoints
    if (rest.status) delete (rest).status;
    Object.assign(listing, rest);
    if (returnWindowDays !== undefined) listing.returnWindowDays = returnWindowDays;
    if (returnPolicy !== undefined) listing.returnPolicy = returnPolicy;
    if (publishAt !== undefined) listing.publishAt = publishAt;

    // Remove photos the seller dropped (publicIds, possibly joined by commas).
    if (Array.isArray(removeImages) && removeImages.length) {
      const removeSet = new Set(removeImages);
      const kept = listing.images.filter((img) => !removeSet.has(img.publicId));
      if (kept.length === 0) {
        return res.status(400).json({ error: "A listing needs at least one photo — remove photos one at a time." });
      }
      listing.images = kept;
      await Promise.allSettled(removeImages.map((pid) => destroyAsset(pid)));
    }

    if (imageOrder !== undefined) {
      // Reorder `images` by the supplied publicIds; the first becomes the cover.
      // Runs AFTER removals so ids of deleted photos simply don't match.
      const byId = new Map(listing.images.map((img) => [img.publicId, img]));
      const reordered = imageOrder.map((pid) => byId.get(pid)).filter(Boolean);
      if (reordered.length && reordered.length === listing.images.length) listing.images = reordered;
    }

    // New photos (multipart `images` files) — appended so the cover stays put.
    if (req.files?.length) {
      uploaded = await Promise.all(
        req.files.map(async (file) => {
          const result = await uploadBuffer(file.buffer);
          return { publicId: result.public_id, width: result.width, height: result.height, bytes: result.bytes };
        }),
      );
      listing.images.push(...uploaded);
    }

    if (tags !== undefined) {
      listing.tags = tags ? tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12) : [];
    }
    if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
      listing.locationCoord = { type: "Point", coordinates: [lng, lat] };
    } else if (data.lat === null || data.lng === null) {
      listing.locationCoord = undefined;
    }
    // Re-run proactive moderation if content changed and listing is not draft (drafts scanned on publish)
    if (listing.status !== "draft" && (rest.title !== undefined || rest.brand !== undefined || rest.description !== undefined || tags !== undefined)) {
      const mod = moderateListing({ title: listing.title, brand: listing.brand, description: listing.description, tags: listing.tags });
      listing.moderationScore = mod.score;
      listing.moderationReason = mod.reasons.join("; ");
      if (mod.flagged) {
        listing.moderationStatus = "flagged";
        listing.flaggedAt = new Date();
        const { recordAudit } = await import("../models/AuditLog.js");
        void recordAudit(req, {
          action: "listing.flagged",
          targetType: "listing",
          targetId: String(listing._id),
          targetLabel: listing.title,
          reason: listing.moderationReason,
          metadata: { score: mod.score, via: "edit" },
        }).catch(()=>{});
      } else {
        // If previously flagged but now clean, auto-approve (admin may still review history)
        if (listing.moderationStatus === "flagged") listing.moderationStatus = "approved";
        listing.moderationReason = "";
        listing.moderationScore = mod.score;
      }
    }
    await listing.save();
    void notifyWatchers(listing, prevValue, prevStatus);
    await listing.populate("seller", "username displayName rating swaps avatar");
    res.json({ listing: serialize(listing) });
  } catch (err) {
    // Don't leave orphaned assets behind if the DB write fails.
    await Promise.allSettled(uploaded.map((i) => destroyAsset(i.publicId)));
    next(err);
  }
});

/** POST /api/listings/:id/publish — publish a draft (or scheduled) listing. Validates required fields + images. */
router.post("/:id/publish", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) !== String(req.user._id)) return res.status(403).json({ error: "Not your listing" });
    if (!["draft", "scheduled"].includes(listing.status)) return res.status(400).json({ error: `Only draft/scheduled listings can be published (current: ${listing.status})` });
    // Validate required fields for a live listing
    if (!listing.title || !listing.brand || !listing.category || !listing.size || !listing.condition || !listing.color || !listing.value) {
      return res.status(400).json({ error: "Fill title, brand, category, size, condition, color and swap value before publishing." });
    }
    if (!listing.images?.length) return res.status(400).json({ error: "Add at least one photo before publishing." });
    // Run moderation on publish
    const mod = moderateListing({ title: listing.title, brand: listing.brand, description: listing.description, tags: listing.tags });
    listing.moderationScore = mod.score;
    listing.moderationReason = mod.reasons.join("; ");
    listing.moderationStatus = mod.flagged ? "flagged" : "approved";
    listing.flaggedAt = mod.flagged ? new Date() : null;
    listing.status = "active";
    listing.publishAt = null;
    await listing.save();
    if (listing.moderationStatus === "approved") void notifySavedSearchMatches(listing);
    if (mod.flagged) {
      const { recordAudit } = await import("../models/AuditLog.js");
      void recordAudit(req, { action: "listing.flagged", targetType: "listing", targetId: String(listing._id), targetLabel: listing.title, reason: listing.moderationReason, metadata: { score: mod.score, via: "publish" } }).catch(()=>{});
      await listing.populate("seller", "username displayName rating swaps avatar");
      return res.json({ listing: serialize(listing), moderation: { status: "flagged", reason: listing.moderationReason, score: mod.score }, warning: "Flagged for review — pending moderation. It will appear in browse after approval." });
    }
    await listing.populate("seller", "username displayName rating swaps avatar");
    res.json({ listing: serialize(listing), moderation: { status: "approved", score: mod.score } });
  } catch (err) { next(err); }
});

/** POST /api/listings/:id/schedule — schedule a draft/active listing to publish at future date. */
router.post("/:id/schedule", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) !== String(req.user._id)) return res.status(403).json({ error: "Not your listing" });
    const { publishAt } = z.object({ publishAt: z.string().datetime() }).parse(req.body);
    const dt = new Date(publishAt);
    if (isNaN(dt.getTime()) || dt.getTime() <= Date.now()) return res.status(400).json({ error: "publishAt must be a future date." });
    if (["swapped", "hidden"].includes(listing.status)) return res.status(400).json({ error: `Cannot schedule a ${listing.status} listing` });
    // Validate draft has minimum fields for future publish (title required)
    if (!listing.title) return res.status(400).json({ error: "Add a title before scheduling." });
    listing.status = "scheduled";
    listing.publishAt = dt;
    listing.moderationStatus = "pending"; // will be scanned at publish time (or now for preview)
    const mod = moderateListing({ title: listing.title, brand: listing.brand, description: listing.description, tags: listing.tags });
    listing.moderationScore = mod.score;
    listing.moderationReason = mod.reasons.join("; ");
    if (mod.flagged) {
      listing.moderationStatus = "flagged";
      listing.flaggedAt = new Date();
    }
    await listing.save();
    await listing.populate("seller", "username displayName rating swaps avatar");
    res.json({ listing: serialize(listing), moderation: { status: listing.moderationStatus, reason: listing.moderationReason } });
  } catch (err) { next(err); }
});

/** Helper: notify per-listing watchers about price drop or restock, respecting their prefs. */
async function notifyWatchers(listing, prevValue, prevStatus) {
  try {
    const watches = await Watch.find({ listing: listing._id }).lean();
    if (!watches.length) return;
    const isPriceDrop = prevValue != null && listing.value != null && listing.value < prevValue;
    // Restock: item that was swapped/hidden becomes active again (seller relisted or toggled visible).
    const isRestock = (prevStatus === "swapped" || prevStatus === "hidden") && listing.status === "active";
    if (!isPriceDrop && !isRestock) {
      await Watch.updateMany({ listing: listing._id }, { lastValue: listing.value });
      return;
    }
    for (const w of watches) {
      if (isPriceDrop && w.notifyPriceDrop === false) continue;
      if (isRestock && w.notifyRestock === false) continue;
      const kind = isPriceDrop && isRestock ? "Price drop + Restocked" : isPriceDrop ? "Price drop" : "Restocked";
      const body = isPriceDrop && isRestock
        ? `“${listing.title}” is back and dropped from ${prevValue} to ${listing.value} credits`
        : isPriceDrop
          ? `“${listing.title}” dropped from ${prevValue} to ${listing.value} credits`
          : `“${listing.title}” is back in stock`;
      await notify(w.user, { kind: "watch_alert", title: `${kind}: ${listing.title}`, body, href: `/listing/${listing._id}`, actor: null });
      void pushToUser(w.user, { title: `${kind}`, body, href: `/listing/${listing._id}` });
    }
    await Watch.updateMany({ listing: listing._id }, { lastValue: listing.value });
  } catch {}
}

/** PATCH /api/listings/:id/watch — update price-drop/restock alert prefs for a watch */
router.patch("/:id/watch", requireAuth, async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Listing not found" });
    const data = z.object({
      notifyPriceDrop: z.boolean().optional(),
      notifyRestock: z.boolean().optional(),
    }).parse(req.body ?? {});
    const watch = await Watch.findOne({ user: req.user._id, listing: req.params.id });
    if (!watch) return res.status(404).json({ error: "Not watching this item" });
    if (typeof data.notifyPriceDrop === "boolean") watch.notifyPriceDrop = data.notifyPriceDrop;
    if (typeof data.notifyRestock === "boolean") watch.notifyRestock = data.notifyRestock;
    await watch.save();
    res.json({ watching: true, watch: { id: String(watch._id), lastValue: watch.lastValue, notifyPriceDrop: watch.notifyPriceDrop, notifyRestock: watch.notifyRestock } });
  } catch (err) { next(err); }
});

/** PATCH /api/listings/:id/visibility — owner unpublishes/re-publishes without deleting. */
router.patch("/:id/visibility", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) !== String(req.user._id)) return res.status(403).json({ error: "Not your listing" });

    const { visible } = z.object({ visible: z.boolean() }).parse(req.body ?? {});
    const prevValueVis = listing.value;
    const prevStatusVis = listing.status;
    listing.status = visible ? "active" : "hidden";
    await listing.save();
    if (visible && (prevStatusVis === "hidden" || prevStatusVis === "swapped")) {
      void notifyWatchers(listing, prevValueVis, prevStatusVis);
    }
    await listing.populate("seller", "username displayName rating swaps avatar");
    res.json({ listing: serialize(listing) });
  } catch (err) { next(err); }
});

/** POST /api/listings/:id/boost — self-serve featured boost (pay with credits). */
router.post("/:id/boost", requireAuth, async (req, res, next) => {
  try {
    const BOOST_COST = 30;
    const BOOST_DAYS = 7;
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) !== String(req.user._id)) return res.status(403).json({ error: "Not your listing" });
    if (listing.status !== "active") return res.status(400).json({ error: "Only active listings can be boosted" });
    if (isEffectivelyFeatured(listing)) {
      const hrs = listing.featuredUntil ? Math.ceil((listing.featuredUntil.getTime() - Date.now()) / 3600000) : 0;
      const msg = listing.featuredUntil && hrs > 0 ? `Already boosted — ${hrs}h remaining` : "Already featured — cannot boost again while featured";
      return res.status(400).json({ error: msg, featuredUntil: listing.featuredUntil });
    }
    const { User } = await import("../models/User.js");
    const { Payment } = await import("../models/Payment.js");
    // Atomic guarded deduction: the filter re-checks the balance at write time,
    // so two concurrent boost requests (double-click, two tabs) can't both
    // pass the earlier read-only check and drive credits negative. Only one
    // of them will match and deduct; the other sees matchedCount 0 and bails.
    const deducted = await User.updateOne(
      { _id: req.user._id, credits: { $gte: BOOST_COST } },
      { $inc: { credits: -BOOST_COST } },
    );
    if (deducted.matchedCount === 0) {
      const latest = await User.findById(req.user._id).select("credits");
      return res.status(400).json({ error: `Need ${BOOST_COST} credits to boost. You have ${latest?.credits ?? 0}.`, needed: BOOST_COST, balance: latest?.credits ?? 0 });
    }
    // Create ledger entry
    const receiptNo = await Payment.nextReceiptNo();
    await Payment.create({
      type: "boost",
      status: "completed",
      amount: BOOST_COST,
      currency: "credits",
      from: req.user._id,
      to: null,
      swap: null,
      gateway: "credits",
      receiptNo,
      note: `Boosted “${listing.title}” for ${BOOST_DAYS} days`,
      completedAt: new Date(),
    });
    listing.featured = true;
    listing.featuredAt = new Date();
    listing.featuredUntil = new Date(Date.now() + BOOST_DAYS * 86400000);
    listing.boostCount = (listing.boostCount || 0) + 1;
    await listing.save();
    await listing.populate("seller", "username displayName rating swaps avatar");
    res.json({ listing: serialize(listing), featuredUntil: listing.featuredUntil, cost: BOOST_COST });
  } catch (err) { next(err); }
});

/** DELETE /api/listings/:id — owner only; also removes Cloudinary assets. */
router.delete("/:id", requireAuth, async (req, res, next) => {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) return res.status(404).json({ error: "Listing not found" });
    if (String(listing.seller) !== String(req.user._id)) return res.status(403).json({ error: "Not your listing" });

    // Refuse to delete an item that's inside a live swap — otherwise the swap
    // becomes a ghost thread (requestedListing: null) the other party can never
    // complete or get their credits back from. Unpublish it instead.
    const liveSwap = await Swap.exists({
      status: { $in: ["pending", "accepted"] },
      $or: [{ requestedListing: listing._id }, { offeredListing: listing._id }, { offeredListings: listing._id }],
    });
    if (liveSwap) {
      return res.status(409).json({
        error: "This listing is part of an active swap. Cancel or complete that swap before deleting it — or hide the listing instead.",
      });
    }

    await Promise.allSettled(listing.images.map((i) => destroyAsset(i.publicId)));
    // Remove this listing from any users' wishlists to avoid dangling references
    try {
      await Wishlist.updateMany(
        { "items.listing": listing._id },
        { $pull: { items: { listing: listing._id } } },
      );
    } catch (e) {
      // non-fatal: log and continue with deletion
      console.warn("Failed to cleanup wishlists for deleted listing", listing._id, e);
    }
    await listing.deleteOne();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
export { serialize };