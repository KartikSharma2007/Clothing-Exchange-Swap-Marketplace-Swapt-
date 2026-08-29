/**
 * Block helpers. A block is unilateral but enforced in both directions: once
 * member A blocks member B, neither A nor B can message / follow / swap with
 * each other, and their content is hidden from the other.
 */

/**
 * Does either member block the other?
 * Accepts full docs (with a `blockedUsers` array) or { _id }-shaped values.
 */
export function areBlocked(a, b) {
  const aId = String(a?._id ?? a ?? "");
  const bId = String(b?._id ?? b ?? "");
  if (!aId || !bId) return false;
  if ((a?.blockedUsers ?? []).some((x) => String(x) === bId)) return true;
  if ((b?.blockedUsers ?? []).some((x) => String(x) === aId)) return true;
  return false;
}