import crypto from "node:crypto";
import { RefreshToken } from "../models/RefreshToken.js";

const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
// When "keep me logged in" is off, the session cookie dies with the browser
// and the stored refresh token expires much sooner.
const SESSION_DAYS = Number(process.env.SESSION_TOKEN_TTL_DAYS || 1);

export const REFRESH_COOKIE = "swapt_rt";

function hash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Cookie settings for the refresh token. `persist` mirrors the "keep me
 * logged in" checkbox: false yields a session cookie (no maxAge), which the
 * browser clears when the tab/app is closed.
 */
export function refreshCookieOptions({ persist = true } = {}) {
  return {
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    ...(persist ? { maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000 } : {}),
  };
}

/**
 * Issue a refresh token. `persist=false` (unchecked "keep me logged in")
 * shortens the token lifetime to a single session.
 */
export async function issueRefreshToken(user, req, family = crypto.randomUUID(), persist = true) {
  const days = persist ? REFRESH_DAYS : SESSION_DAYS;
  const token = crypto.randomBytes(48).toString("base64url");
  await RefreshToken.create({
    user: user._id,
    tokenHash: hash(token),
    family,
    persist,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
    tokenVersion: user.tokenVersion ?? 0,
    userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    ip: req.ip,
  });
  return { token, family };
}

/**
 * Rotate a refresh token. Detects reuse of an already-rotated token and
 * revokes the entire family when that happens.
 *
 * Two browser tabs refreshing the same family at the same moment is a benign
 * race, not an attack: tab A rotates the token, then tab B presents the
 * now-revoked one. To avoid logging the user out of both tabs, a short grace
 * window is allowed where the recently-issued replacement still counts.
 */
const REUSE_GRACE_MS = 15_000;

export async function rotateRefreshToken(rawToken, req) {
  const existing = await RefreshToken.findOne({ tokenHash: hash(rawToken) }).populate("user");
  if (!existing) throw Object.assign(new Error("Invalid refresh token"), { status: 401 });

  if (existing.revokedAt) {
    // Benign multi-tab race: the replacement was issued moments ago, so the
    // old token being presented is expected, not a replay. Reject this refresh
    // but leave the family intact so the winning tab stays signed in.
    if (existing.replacedBy) {
      const replacement = await RefreshToken.findOne({ tokenHash: existing.replacedBy });
      if (replacement && !replacement.revokedAt && Date.now() - replacement.createdAt.getTime() < REUSE_GRACE_MS) {
        throw Object.assign(new Error("Session refreshed elsewhere"), { status: 401 });
      }
    }
    await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
    throw Object.assign(new Error("Refresh token reuse detected — please log in again"), { status: 401 });
  }
  if (existing.expiresAt.getTime() < Date.now()) {
    throw Object.assign(new Error("Refresh token expired"), { status: 401 });
  }
  if (!existing.user) throw Object.assign(new Error("Account no longer exists"), { status: 401 });
  if (existing.user.deletedAt) {
    await revokeAllForUser(existing.user._id);
    throw Object.assign(new Error("Account no longer exists"), { status: 401 });
  }
  // A suspended user's sessions stop working (matches requireAuth).
  if (existing.user.status === "suspended") {
    await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
    throw Object.assign(new Error("This account is suspended"), { status: 403 });
  }
  // Password change / security bump bumps tokenVersion — older sessions die.
  if ((existing.tokenVersion ?? 0) !== (existing.user.tokenVersion ?? 0)) {
    await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
    throw Object.assign(new Error("Session expired — please log in again"), { status: 401 });
  }

  const { token } = await issueRefreshToken(existing.user, req, existing.family, existing.persist);
  existing.revokedAt = new Date();
  existing.replacedBy = hash(token);
  await existing.save();

  return { token, user: existing.user, persist: existing.persist };
}

export async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: hash(rawToken) }, { revokedAt: new Date() });
}

export async function revokeAllForUser(userId) {
  await RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });
}
