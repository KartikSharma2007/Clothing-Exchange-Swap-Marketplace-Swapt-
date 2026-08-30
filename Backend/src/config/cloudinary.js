import crypto from "node:crypto";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const PRIVATE = String(process.env.CLOUDINARY_PRIVATE_ASSETS ?? "true") === "true";
const FOLDER = process.env.CLOUDINARY_FOLDER || "swapt/listings";
const TTL = Number(process.env.CLOUDINARY_SIGNED_URL_TTL || 3600);
// Public origin of this API — used to build the stable media-proxy URLs that
// get embedded in API responses (e.g. `images: [...]` on a listing).
//
// Resolution order:
//   1. API_ORIGIN            — explicit override, set this in production.
//   2. RENDER_EXTERNAL_URL   — Render sets this automatically on every web
//                              service, so deployments work even if API_ORIGIN
//                              was never configured manually.
//   3. http://localhost:PORT — local development fallback only.
//
// IMPORTANT: if this ever resolves to a localhost URL in production, every
// image URL served to clients will be unreachable for anyone except someone
// running a backend on their own machine at that exact port — that is the
// exact bug this fallback chain exists to prevent.
const API_ORIGIN = process.env.API_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 4000}`;

// Always log the resolved value once at boot — check your Render service logs
// for this line if images still aren't loading after a deploy.
// eslint-disable-next-line no-console
console.log(`[cloudinary] API_ORIGIN resolved to: ${API_ORIGIN}`);

// `RENDER` is set to "true" by Render on every service it runs, regardless of
// NODE_ENV — use that (not NODE_ENV) to detect "we are actually on Render but
// still fell back to localhost", since NODE_ENV is easy to forget to set.
if (process.env.RENDER && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(API_ORIGIN)) {
  // eslint-disable-next-line no-console
  console.error(
    "[cloudinary] WARNING: running on Render but API_ORIGIN resolved to " +
      `"${API_ORIGIN}". Neither API_ORIGIN nor RENDER_EXTERNAL_URL is set/visible ` +
      "to this process. Every image URL served to clients right now is broken. " +
      "Set API_ORIGIN explicitly in Render → your service → Environment to this " +
      "service's public URL, e.g. https://your-app.onrender.com (no trailing slash), " +
      "then redeploy.",
  );
}

/** Upload a Multer memory-storage buffer to Cloudinary. */
export function uploadBuffer(buffer, { folder = FOLDER, filename } = {}) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: filename,
        resource_type: "image",
        // "authenticated" assets are not publicly reachable; they require a signed URL.
        type: PRIVATE ? "authenticated" : "upload",
        overwrite: false,
        transformation: [{ quality: "auto", fetch_format: "auto" }],
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );
    stream.end(buffer);
  });
}

/**
 * Build a URL for a stored asset.
 *
 * When assets are private (authenticated) the Cloudinary URL is signed and
 * short-lived, so embedding it directly would let cached pages go stale.
 * Instead we return a *stable* URL to our media-proxy endpoint
 * (`/api/images/:publicId`) — the proxy issues a fresh signature on every
 * request and 302-redirects, so the client never caches an expired signature.
 * When assets are public we hand back the plain Cloudinary URL as before.
 */
export function signedUrl(publicId, { width } = {}) {
  if (!publicId) return null;
  if (!PRIVATE) {
    return cloudinary.url(publicId, {
      secure: true,
      transformation: [{ quality: "auto", fetch_format: "auto", ...(width ? { width, crop: "fill" } : {}) }],
    });
  }
  const qs = new URLSearchParams();
  if (width) qs.set("w", String(width));
  const suffix = qs.toString();
  return `${API_ORIGIN}/api/images/${encodeURIComponent(publicId)}${suffix ? `?${suffix}` : ""}`;
}

/**
 * Resolve a publicId to a freshly-signed, time-limited Cloudinary URL.
 * Used by the media proxy to redirect the client to a live signature.
 */
export function signAssetUrl(publicId, { width } = {}) {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    secure: true,
    type: "authenticated",
    sign_url: true,
    expires_at: Math.floor(Date.now() / 1000) + TTL,
    transformation: [{ quality: "auto", fetch_format: "auto", ...(width ? { width, crop: "fill" } : {}) }],
  });
}

/** Folders we're allowed to serve through the media proxy. */
const ALLOWED_FOLDERS = ["swapt/listings", "swapt/avatars", "swapt/dispute-evidence"];

/** True if a publicId belongs to a folder the proxy is permitted to serve. */
export function isAllowedAsset(publicId) {
  return ALLOWED_FOLDERS.some((f) => String(publicId).startsWith(`${f}/`));
}

// Dispute evidence is private: the proxy only serves it to a viewer who holds
// a short-lived token the SERVER mints. Tokens are minted exclusively when a
// swap participant or admin is shown their evidence, so a leaked publicId is
// worthless on its own. Keyed off the JWT secret (already secret server-side);
// override with ASSET_URL_SECRET to isolate asset signing.
const ASSET_TOKEN_SECRET = process.env.ASSET_URL_SECRET || process.env.JWT_ACCESS_SECRET || "";

/**
 * Build the media-proxy URL for dispute evidence with an HMAC token attached.
 * Without the token the proxy refuses to serve the asset.
 */
export function signEvidenceUrl(publicId, { width } = {}) {
  if (!publicId) return null;
  if (!ASSET_TOKEN_SECRET) return null; // never fall back to an unsigned URL
  const exp = Math.floor(Date.now() / 1000) + TTL;
  const sig = crypto.createHmac("sha256", ASSET_TOKEN_SECRET).update(`${publicId}:${exp}`).digest("hex");
  const qs = new URLSearchParams({ sig, exp });
  if (width) qs.set("w", String(width));
  return `${API_ORIGIN}/api/images/${encodeURIComponent(publicId)}?${qs.toString()}`;
}

/** Verify the HMAC token on an evidence proxy URL (also checks expiry). */
export function verifyEvidenceUrl(publicId, sig, exp) {
  if (!publicId || !sig || !exp || !ASSET_TOKEN_SECRET) return false;
  const expiry = Number(exp);
  if (!Number.isFinite(expiry)) return false;
  if (expiry < Math.floor(Date.now() / 1000)) return false;
  const expected = crypto.createHmac("sha256", ASSET_TOKEN_SECRET).update(`${publicId}:${expiry}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(String(sig), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export async function destroyAsset(publicId) {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { type: PRIVATE ? "authenticated" : "upload", resource_type: "image" });
}

export { cloudinary };