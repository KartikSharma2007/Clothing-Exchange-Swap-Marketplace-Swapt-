/**
 * Size / fit intelligence.
 *
 * A member can save their body measurements; listings carry flat garment
 * measurements. Garments are measured flat, so a wearable piece is a little
 * *larger* than the wearer's body measurement (that extra room is "ease").
 * We flag a dimension as compatible when the flat garment measurement is at
 * least the body measurement and not more than ~12% larger, which is the
 * range most clothing is designed to sit in.
 */

/** Dimensions we compare body-vs-garment. Length/inseam/shoulder need context, so we ignore them. */
const BODY_DIMS = ["chest", "waist", "hips"];

/** Extract the first number from a string like "108 cm" or "42". */
export function parseCm(value) {
  if (typeof value !== "string") return null;
  const m = value.match(/[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compare a user's saved measurements against a listing's flat measurements.
 * Returns `null` when there's nothing to compare; otherwise a summary with a
 * boolean "likely fit" verdict and a per-dimension breakdown for the UI.
 */
export function computeFit(user, listing) {
  if (!user || !listing) return null;
  const u = user.measurements ?? {};
  const l = listing.measurements ?? {};

  const matches = [];
  let compatible = 0;

  for (const dim of BODY_DIMS) {
    const body = parseCm(u[dim]);
    const garment = parseCm(l[dim]);
    if (body == null || garment == null || body <= 0) continue;

    const ok = garment >= body * 0.97 && garment <= body * 1.12;
    if (ok) compatible += 1;
    matches.push({
      dimension: dim,
      body,
      garment,
      ok,
      note: ok
        ? `The flat ${dim} measurement (${garment} cm) comfortably accommodates your ${body} cm.`
        : `The flat ${dim} measurement (${garment} cm) doesn't comfortably match your ${body} cm.`,
    });
  }

  if (matches.length === 0) return null;

  if (compatible === 0) return { likelyFit: false, confidence: null, matches };

  // A matching "usual size" tag is a weak supporting signal, never enough on its own.
  if (matches.length === 1 && listing.size && user.usualSize && String(listing.size) === String(user.usualSize)) {
    matches[0].note += ` It's your usual size (${listing.size}).`;
  }

  return {
    likelyFit: true,
    confidence: compatible >= 3 ? "high" : compatible === 2 ? "medium" : "low",
    matches,
  };
}
