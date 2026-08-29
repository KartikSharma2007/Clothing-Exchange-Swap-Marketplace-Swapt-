/**
 * Proactive content moderation for listings.
 * Lightweight but effective: banned keywords, suspicious patterns, and heuristic scoring.
 * High severity -> auto-flag + hidden until admin review; medium -> flagged but still discoverable with warning; low -> approved.
 *
 * Score 0-100: 0 clean, 100 egregious. Designed to be conservative: false positives are flagged not rejected.
 */

const BANNED_KEYWORDS = [
  // Counterfeit / scam
  "replica", "fake", "counterfeit", "knockoff", "first copy", "mirror copy",
  // Prohibited categories
  "weapon", "gun", "rifle", "pistol", "ammunition", "knife", "drugs", "cocaine", "heroin", "marijuana", "vape",
  // Spam / off-platform
  "whatsapp me", "dm on insta", "pay outside", "cashapp", "venmo outside", "telegram me",
  // Adult / illicit
  "nude", "explicit", "escort",
];

const SUSPICIOUS_PATTERNS = [
  { rx: /https?:\/\//i, weight: 30, reason: "External link — possible off-platform payment" },
  { rx: /(whatsapp|telegram|instagram|insta|snapchat)\s*[:@]/i, weight: 40, reason: "Off-platform contact — risk of scam" },
  { rx: /\b(cash\s*app|venmo|pay(pal)?\s*outside)\b/i, weight: 40, reason: "Off-platform payment" },
  { rx: /\b\d{10,}\b/, weight: 10, reason: "Phone-like number" },
  { rx: /[A-Z]{5,}/, weight: 5, reason: "Excessive caps" },
  { rx: /(.)\1{5,}/, weight: 5, reason: "Repeated characters" },
  { rx: /\b(free money|make money fast|get rich quick)\b/i, weight: 35, reason: "Spam / scam phrase" },
];

const BRAND_SUSPICION = [
  // Over-claiming luxury without proof — flag for review
  { brand: "gucci", keywords: ["brand new", "with tags", "receipt", "authentic"], weight: 10 },
  { brand: "louis vuitton", keywords: ["cheap", "discount", "sale"], weight: 15 },
];

export function moderateListing({ title = "", brand = "", description = "", tags = [] } = {}) {
  const hay = `${title} ${brand} ${description} ${(Array.isArray(tags) ? tags.join(" ") : tags)}`.toLowerCase();
  const cleanHay = hay.trim();
  if (!cleanHay) return { status: "approved", score: 0, reasons: [], flagged: false };

  let score = 0;
  const reasons = [];

  // Banned keywords
  for (const kw of BANNED_KEYWORDS) {
    if (hay.includes(kw.toLowerCase())) {
      const w = kw === "replica" || kw === "fake" || kw === "counterfeit" || kw === "weapon" ? 50 : 30;
      score += w;
      reasons.push(`Banned keyword: "${kw}"`);
    }
  }

  // Suspicious regexes
  for (const p of SUSPICIOUS_PATTERNS) {
    if (p.rx.test(cleanHay)) {
      score += p.weight;
      reasons.push(p.reason);
    }
  }

  // Brand-specific heuristics — over-claiming authenticity language on a
  // luxury brand without proof context nudges the score up (doesn't reject).
  const lowBrand = String(brand).toLowerCase();
  for (const b of BRAND_SUSPICION) {
    if (lowBrand.includes(b.brand) && b.keywords.some((kw) => hay.includes(kw))) {
      score += b.weight;
      reasons.push(`Unverified authenticity claim on ${b.brand}`);
    }
  }

  // Price manipulation heuristic handled elsewhere (value extremes); here we flag unrealistic retailValue
  // e.g., retailValue >> value might be legitimate discount, so we don't penalize heavily

  // Very short description + high value -> possible low-effort scam
  if (String(description).trim().length < 20 && String(title).length > 0) {
    score += 10;
    reasons.push("Very short description");
  }

  // Duplicate words spam
  const words = hay.split(/\s+/).filter(Boolean);
  const unique = new Set(words);
  if (words.length > 20 && unique.size / words.length < 0.4) {
    score += 15;
    reasons.push("Repetitive / spammy text");
  }

  score = Math.min(100, score);

  let status = "approved";
  let flagged = false;
  if (score >= 30) {
    status = "flagged";
    flagged = true;
  }

  // Prohibited-category keywords (weapons, drugs, counterfeit) are always
  // treated as critical regardless of total score — these categories are
  // never acceptable at any severity, unlike borderline spam signals which
  // only add up to a flag. Previously this only covered a hand-picked slice
  // of the list (weapons only), silently missing drugs/counterfeit/adult
  // categories — now it checks every keyword's own severity weight instead.
  const CRITICAL_KEYWORDS = new Set([
    "replica", "fake", "counterfeit", "knockoff", "first copy", "mirror copy",
    "weapon", "gun", "rifle", "pistol", "ammunition", "knife",
    "drugs", "cocaine", "heroin", "marijuana",
  ]);
  const critical = [...CRITICAL_KEYWORDS].some((kw) => hay.includes(kw)) || score >= 70;
  if (critical) {
    status = "flagged";
    flagged = true;
  }

  return {
    status,
    score,
    reasons,
    flagged,
    action: flagged ? "auto_hidden_pending_review" : "none",
  };
}

export const MODERATION_THRESHOLDS = { flagged: 30, high: 50 };