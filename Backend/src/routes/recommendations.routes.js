import { Router } from "express";
import { z } from "zod";
import { requireAuth, optionalAuth } from "../middleware/auth.js";
import { recommendations } from "../utils/recommendations.js";
import { serialize } from "./listing.routes.js";

const router = Router();

const limitSchema = z.object({ limit: z.coerce.number().int().min(1).max(24).optional().default(12) });

/**
 * GET /api/recommendations/for-you?limit=12 — personalised picks.
 * Content-based scoring over wishlist + saved-search signals, TTL-cached.
 */
router.get("/for-you", requireAuth, async (req, res, next) => {
  try {
    const { limit } = limitSchema.parse(req.query);
    const docs = await recommendations.cached(
      `for-you:${req.user.id}:${limit}`,
      recommendations.CACHE_TTL.forYou,
      () => recommendations.forYou(req.user.id, limit),
    );
    res.json({ items: docs.filter((d) => !isBlocked(d, req.user)).map((d) => serialize(d, req.user)) });
  } catch (err) { next(err); }
});

/** A listing is hidden from the viewer if its seller is in their blocked list. */
function isBlocked(listing, user) {
  const id = String(listing.seller?._id ?? listing.seller ?? "");
  if (!id) return false;
  return (user.blockedUsers || []).some((b) => String(b) === id);
}

/**
 * GET /api/recommendations/popular?limit=12 — "Trending this week".
 * Popularity + featured + recency, TTL-cached. Public.
 */
router.get("/popular", optionalAuth, async (req, res, next) => {
  try {
    const { limit } = limitSchema.parse(req.query);
    const docs = await recommendations.cached(
      `popular:${limit}`,
      recommendations.CACHE_TTL.popular,
      () => recommendations.popularListings(limit),
    );
    res.json({ items: docs.filter((d) => (req.user ? !isBlocked(d, req.user) : true)).map((d) => serialize(d)) });
  } catch (err) { next(err); }
});

/**
 * POST /api/recommendations/clear-cache — invalidation hook (admin use).
 */
router.post("/clear-cache", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ error: "Admin only" });
    recommendations.clearCache();
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;