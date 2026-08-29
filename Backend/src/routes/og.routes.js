import { Router } from "express";
import mongoose from "mongoose";
import { Listing } from "../models/Listing.js";
import { signedUrl } from "../config/cloudinary.js";

const router = Router();

/**
 * Server-rendered Open Graph page for a listing.
 *
 * Social crawlers (Discord, Slack, iMessage, Facebook…) don't run the SPA, so
 * they'd only ever see a blank <title>. This route returns a tiny HTML page
 * with the product's og:/twitter: meta tags so link previews show the item.
 * The og:image is a freshly-signed Cloudinary URL (listings are private).
 */
router.get("/listing/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).send("<title>Not found — Swapt</title>");
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing || listing.status !== "active") {
      return res.status(404).send("<title>Not found — Swapt</title>");
    }

    const client = process.env.CLIENT_ORIGIN || "http://localhost:8080";
    const canonical = `${client}/listing/${listing._id}`;
    const title = `${listing.title} — ${listing.brand} · Swapt`;
    const desc = `${listing.condition} ${listing.category} in size ${listing.size}. ` +
      `Swap for ${listing.value} credits. ${listing.location ? `Near ${listing.location}.` : ""}` +
      (listing.meetup ? " Available for local meetup." : "");
    const image = listing.images?.[0] ? signedUrl(listing.images[0].publicId) : `${client}/og-default.png`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}" />
  <link rel="canonical" href="${canonical}" />

  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Swapt" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:image" content="${image}" />
  <meta property="og:image:alt" content="${esc(listing.title)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:locale" content="en_US" />
  <meta property="product:brand" content="${esc(listing.brand)}" />
  <meta property="product:availability" content="in stock" />

  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(title)}" />
  <meta name="twitter:description" content="${esc(desc)}" />
  <meta name="twitter:image" content="${image}" />

  <meta http-equiv="refresh" content="0; url=${canonical}" />
</head>
<body style="font-family:system-ui;max-width:560px;margin:40px auto;padding:0 16px;color:#222">
  <h1>${esc(title)}</h1>
  <p>${esc(desc)}</p>
  <a href="${canonical}">Open in Swapt →</a>
</body>
</html>`;

    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) { next(err); }
});

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default router;
