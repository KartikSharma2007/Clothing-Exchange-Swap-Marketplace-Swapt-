import { Listing } from "../models/Listing.js";
import { Wishlist } from "../models/Wishlist.js";
import { SavedSearch } from "../models/SavedSearch.js";

/** Simple TTL cache (in-memory). No external deps — fresh per process. */
const cache = new Map();
const CACHE_TTL = {
  popular: 5 * 60 * 1000,
  forYou: 10 * 60 * 1000,
};

function cached(key, ttl, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = build();
  if (value && typeof value.then === "function") {
    return value.then((v) => {
      cache.set(key, { at: Date.now(), value: v });
      return v;
    });
  }
  cache.set(key, { at: Date.now(), value });
  return value;
}

function clearCache() {
  cache.clear();
}

const norm = (v) => String(v || "").toLowerCase().trim();

/** Popularity-driven row — "Trending this week". Views + saves + featured + recency. */
async function popularListings(limit = 12) {
  const docs = await Listing.aggregate([
    { $match: { status: "active" } },
    {
      $addFields: {
        popularity: {
          $add: [
            { $multiply: ["$views", 1] },
            { $multiply: [{ $ifNull: ["$saves", 0] }, 3] },
            { $cond: [{ $eq: ["$featured", true] }, 20, 0] },
            { $max: [0, { $subtract: [10, { $divide: [{ $subtract: [Date.now(), { $toLong: "$createdAt" }] }, 86400000] }] }] },
          ],
        },
      },
    },
    { $sort: { popularity: -1, featured: -1, views: -1 } },
    { $limit: limit },
  ]);
  return Listing.populate(docs, { path: "seller" });
}

/**
 * Content-based personalisation — collaborative signals (wishlist, saved
 * searches) turned into attribute weights, scored against the live catalogue.
 */
async function forYou(userId, limit = 12) {
  const [wish, searches] = await Promise.all([
    Wishlist.findOne({ user: userId }).select("items"),
    SavedSearch.find({ user: userId }).limit(25).lean(),
  ]);

  const weights = { category: {}, brand: {}, gender: {}, size: {}, color: {} };
  const wishlisted = new Set();
  let sizeHits = 0;

  for (const item of wish?.items ?? []) {
    wishlisted.add(String(item.listing));
  }
  if (wish?.items?.length) {
    const saved = await Listing.find({ _id: { $in: wish.items.slice(0, 12).map((i) => i.listing) } })
      .select("category brand gender size color").lean();
    for (const l of saved) {
      bump(weights.category, l.category, 3);
      bump(weights.brand, l.brand, 2);
      bump(weights.gender, l.gender, 2);
      bump(weights.size, l.size, 1.5);
      bump(weights.color, l.color, 1);
    }
  }

  for (const s of searches) {
    if (s.cat) bump(weights.category, s.cat, 2);
    if (s.brand) bump(weights.brand, s.brand, 1.5);
    if (s.g) bump(weights.gender, s.g, 1.5);
    if (s.size) bump(weights.size, s.size, 1);
    sizeHits += s.size ? 1 : 0;
  }

  const top = (bucket) =>
    Object.entries(bucket)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k]) => k);

  const pref = {
    categories: top(weights.category),
    brands: top(weights.brand),
    genders: top(weights.gender),
    sizes: top(weights.size),
    colors: top(weights.color),
  };

  // No personalisation signals yet — fall back to trending.
  if (pref.categories.length + pref.brands.length + pref.genders.length === 0) {
    return popularListings(limit);
  }

  const pool = await Listing.find({
    status: "active",
    seller: { $ne: userId },
    _id: { $nin: [...wishlisted] },
  })
    .sort({ featured: -1, views: -1, createdAt: -1 })
    .limit(400)
    .populate("seller");

  const scored = pool.map((l) => {
    let score = 0;
    if (pref.categories.includes(l.category)) score += 3;
    if (pref.brands.some((b) => b && norm(b) === norm(l.brand))) score += 2;
    if (pref.genders.includes(l.gender)) score += 2;
    if (pref.sizes.includes(l.size)) score += 1.5;
    if (pref.colors.some((c) => c && norm(c) === norm(l.color))) score += 1;
    if (l.condition === "New with tags" || l.condition === "New") score += 0.5;
    score += Math.min(2, (l.views + (l.saves ?? 0) * 3) / 400);
    if (l.featured) score += 1;
    return { l, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.l);
}

function bump(bucket, key, w) {
  if (!key) return;
  const k = String(key);
  bucket[k] = (bucket[k] ?? 0) + w;
}

export const recommendations = {
  cached,
  clearCache,
  popularListings,
  forYou,
  CACHE_TTL,
};

export default recommendations;