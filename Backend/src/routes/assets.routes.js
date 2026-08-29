import { Router } from "express";
import rateLimit from "express-rate-limit";
import { isAllowedAsset, signAssetUrl, verifyEvidenceUrl } from "../config/cloudinary.js";

const router = Router();

// The media proxy hands out a *fresh* Cloudinary signature on every hit and
// redirects, so clients never cache an expired signed URL. `publicId` arrives
// URL-encoded (it may contain "/"), and Express decodes it automatically.
const imgLimiter = rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false });

router.get("/images/:publicId", imgLimiter, (req, res, next) => {
  try {
    const publicId = String(req.params.publicId || "");
    if (!publicId || !isAllowedAsset(publicId)) {
      return res.status(404).json({ error: "Image not found" });
    }

    // Dispute evidence is private. It may only be served to a viewer holding a
    // short-lived token that the server mints when serialising evidence for a
    // swap participant or an admin — knowing a publicId alone is not enough.
    // Listings and avatars are public catalogue content and stay open.
    if (publicId.startsWith("swapt/dispute-evidence/")) {
      const sig = String(req.query.sig || "");
      const exp = String(req.query.exp || "");
      if (!verifyEvidenceUrl(publicId, sig, exp)) {
        return res.status(403).json({ error: "Forbidden" });
      }
    }

    const width = Number(req.query.w);
    const url = signAssetUrl(publicId, { width: width > 0 ? width : undefined });
    if (!url) return res.status(404).json({ error: "Image not found" });
    // No caching on the redirect itself — the browser re-hits the proxy for a
    // live signature each load, but the proxy URL is stable across page views.
    res.setHeader("Cache-Control", "no-cache");
    res.redirect(302, url);
  } catch (err) { next(err); }
});

export default router;
