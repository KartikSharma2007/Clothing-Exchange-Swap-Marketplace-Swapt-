import crypto from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { User } from "../models/User.js";
import { notify } from "../utils/notify.js";
import { requireAuth, signAccessToken } from "../middleware/auth.js";
import { upload, validateImageUpload } from "../middleware/upload.js";
import { destroyAsset, uploadBuffer } from "../config/cloudinary.js";
import {
  REFRESH_COOKIE, issueRefreshToken, refreshCookieOptions,
  revokeAllForUser, revokeRefreshToken, rotateRefreshToken,
} from "../utils/tokens.js";
import { loginSchema, profileSchema, registerSchema } from "../utils/validators.js";
import {
  sendPasswordResetEmail, sendVerificationEmail, sendWelcomeEmail,
  sendPasswordChangedEmail, sendAccountDeletedEmail, emailEnabled,
} from "../utils/email.js";

const router = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const GOOGLE_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_ID ? new OAuth2Client(GOOGLE_ID) : null;

/** True once the profile fields the marketplace requires (beyond what Google gives us) are filled in. */
function googleProfileComplete(user) {
  return Boolean(user.phone && user.address && user.age);
}

async function createWelcomeNotification(user) {
  await notify(user._id, {
    kind: "welcome",
    title: "Welcome to Swapt!",
    body: "Your account is ready. List your first item and start swapping today.",
    href: "/dashboard",
    actor: null,
  });
}

router.post("/register", authLimiter, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await User.findOne({ $or: [{ email: data.email }, { username: data.username }] });
    if (existing) {
      if (existing.deletedAt) {
        return res.status(409).json({
          error: "Your account has been deactivated. To recover your account, please contact support.",
          deleted: true,
          email: existing.email,
        });
      }
      return res.status(409).json({ error: "That email or username is already registered" });
    }
    const user = new User({
      username: data.username,
      email: data.email,
      displayName: data.displayName || data.username,
      location: data.location || "",
      phone: data.phone || "",
      address: data.address || "",
      age: data.age ?? null,
      bio: data.bio || "",
      // When SMTP is configured we require email verification; without it
      // (dev/demo) accounts are auto-verified so the flow still works.
      emailVerified: !emailEnabled,
    });
    await user.setPassword(data.password);

    if (emailEnabled) {
      const token = crypto.randomBytes(32).toString("hex");
      user.emailVerifyTokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.emailVerifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();
      const link = `${process.env.CLIENT_ORIGIN || "http://localhost:8080"}/verify-email?token=${encodeURIComponent(token)}`;
      const sent = await sendVerificationEmail(user.email, link, user.accent || "red");
      // Always log the link in non-production so a missing email doesn't brick the account
      if (process.env.NODE_ENV !== "production") {
        console.log(`[auth] verification link for ${user.email}: ${link} (email sent: ${sent})`);
      } else if (!sent) {
        console.warn(`[auth] verification email FAILED for ${user.email} — link: ${link}`);
      }
      const payload = { needsVerification: true, email: user.email };
      // In dev, return the link so the UI can offer a one-click verify (prevents "account not opening" confusion)
      if (process.env.NODE_ENV !== "production") {
        payload.devVerificationLink = link;
        payload.devToken = token;
      }
      return res.status(201).json(payload);
    }

    await user.save();
    await createWelcomeNotification(user);
    // No verification step in this deployment (SMTP/Resend not configured) —
    // the account is live immediately, so welcome them right away.
    void sendWelcomeEmail(user.email, user.displayName || user.username, user.accent || "red").catch(() => {});

    const { token: refreshToken } = await issueRefreshToken(user, req);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.status(201).json({ user: user.toPublicJSON(), accessToken: signAccessToken(user) });
  } catch (err) { next(err); }
});

router.post("/forgot", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await User.findOne({ email, provider: "local", deletedAt: null }).select("+resetPasswordTokenHash +resetPasswordExpiresAt");
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      user.resetPasswordTokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.resetPasswordExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      if (emailEnabled) {
        const link = `${process.env.CLIENT_ORIGIN || "http://localhost:8080"}/forgot?token=${encodeURIComponent(token)}`;
        await sendPasswordResetEmail(user.email, link, user.accent || "red");
      }
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/reset", authLimiter, async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const newPassword = String(req.body?.password || "");

    if (!token || token.length < 16) {
      return res.status(400).json({ error: "Invalid reset token" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be 8+ characters" });
    }

    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ resetPasswordTokenHash: hash, resetPasswordExpiresAt: { $gt: new Date() }, provider: "local", deletedAt: null }).select("+passwordHash +resetPasswordTokenHash +resetPasswordExpiresAt");
    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    await user.setPassword(newPassword);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpiresAt = null;
    user.tokenVersion += 1;
    await user.save();
    await revokeAllForUser(user._id);

    // Security notice: whoever holds the inbox should know the password changed,
    // in case the reset request wasn't actually theirs.
    void sendPasswordChangedEmail(user.email, { method: "the forgot-password link", accent: user.accent || "red" }).catch(() => {});

    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/login", authLimiter, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    // Find the account even if it was soft-deleted so we can show the recovery
    // path — but still verify the password first to avoid email enumeration.
    const user = await User.findOne({ email: data.email }).select("+passwordHash");
    // Same message for unknown email and bad password — no account enumeration.
    if (!user || !(await user.verifyPassword(data.password))) {
      return res.status(401).json({ error: "We couldn't find an account with those details." });
    }
    if (user.deletedAt) {
      return res.status(403).json({
        error: "Your account has been deactivated. To recover your account, please contact support.",
        deleted: true,
        email: user.email,
      });
    }
    // Suspended accounts must not get a fresh session — they'd just fail on
    // every API call with no explanation. Tell them why, like the Google path.
    if (user.status === "suspended") {
      return res.status(403).json({
        error: "Your account has been suspended. Contact support if you believe this was a mistake.",
        suspended: true,
      });
    }
    // Block unverified accounts from logging in (only enforced when SMTP is on).
    if (!user.emailVerified && emailEnabled) {
      return res.status(403).json({
        error: "Please verify your email before logging in.",
        email: user.email,
        needsVerification: true,
      });
    }
    const { token: refreshToken } = await issueRefreshToken(user, req, crypto.randomUUID(), data.rememberMe);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions({ persist: data.rememberMe }));
    res.json({ user: user.toPublicJSON(), accessToken: signAccessToken(user) });
  } catch (err) { next(err); }
});

/** GET /api/auth/verify-email?token=... — confirm an email address. */
router.get("/verify-email", authLimiter, async (req, res, next) => {
  try {
    const token = String(req.query?.token || "");
    if (!token) return res.status(400).json({ error: "Missing verification token" });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ emailVerifyTokenHash: hash, emailVerifyExpiresAt: { $gt: new Date() } })
      .select("+emailVerifyTokenHash +emailVerifyExpiresAt");
    if (!user) return res.status(400).json({ error: "This verification link is invalid or has expired." });

    user.emailVerified = true;
    user.emailVerifyTokenHash = null;
    user.emailVerifyExpiresAt = null;
    await user.save();
    await createWelcomeNotification(user);
    void sendWelcomeEmail(user.email, user.displayName || user.username, user.accent || "red").catch(() => {});

    // Log the user in right away so "Go to dashboard" after verifying works
    // without a separate sign-in (their access token is returned below).
    if (user.status === "suspended" || user.deletedAt) {
      return res.json({ ok: true });
    }
    const { token: refreshToken } = await issueRefreshToken(user, req, crypto.randomUUID());
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ ok: true, accessToken: signAccessToken(user), user: user.toPublicJSON() });
  } catch (err) { next(err); }
});

/** POST /api/auth/resend-verification — resend the verification email. */
router.post("/resend-verification", authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = await User.findOne({ email, provider: "local", deletedAt: null })
      .select("+emailVerifyTokenHash +emailVerifyExpiresAt");
    // Always respond ok — don't reveal which emails are registered.
    if (user && !user.emailVerified) {
      const token = crypto.randomBytes(32).toString("hex");
      user.emailVerifyTokenHash = crypto.createHash("sha256").update(token).digest("hex");
      user.emailVerifyExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await user.save();
      if (emailEnabled) {
        const link = `${process.env.CLIENT_ORIGIN || "http://localhost:8080"}/verify-email?token=${encodeURIComponent(token)}`;
        const sent = await sendVerificationEmail(user.email, link, user.accent || "red");
        if (process.env.NODE_ENV !== "production") {
          console.log(`[auth] resend verification link for ${user.email}: ${link} (sent: ${sent})`);
        }
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** DEV ONLY: instant verify without email click — fixes "account not opening" in local dev */
router.post("/dev-verify", async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") return res.status(404).json({ error: "Not found" });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email required" });
    const user = await User.findOne({ email, provider: "local", deletedAt: null }).select("+emailVerifyTokenHash +emailVerifyExpiresAt");
    if (!user) return res.status(404).json({ error: "No account with that email" });
    user.emailVerified = true;
    user.emailVerifyTokenHash = null;
    user.emailVerifyExpiresAt = null;
    await user.save();
    const { token: refreshToken } = await issueRefreshToken(user, req, crypto.randomUUID());
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({ ok: true, accessToken: signAccessToken(user), user: user.toPublicJSON() });
  } catch (err) { next(err); }
});

router.post("/google", authLimiter, async (req, res, next) => {
  try {
    if (!googleClient) return res.status(503).json({ error: "Google sign-in isn't configured on the server." });

    const idToken = String(req.body?.idToken || "");
    if (!idToken) return res.status(400).json({ error: "Missing Google ID token" });

    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(401).json({ error: "Google didn't return an email address." });
    if (payload.email_verified === false) {
      return res.status(401).json({ error: "That Google email address isn't verified." });
    }

    let user = await User.findOne({ googleId: payload.sub, deletedAt: null });

    // "signup" comes from /signup, "signin" from /login. On "signin" we refuse
    // to create a brand-new account, so the login page can never silently sign
    // someone up — only existing users can use Google to log in.
    const intent = String(req.body?.intent || "signup");

    if (!user) {
      // Google account first seen. If a local account shares the email, do NOT
      // silently link it — return a consent marker and let the client ask the
      // user to prove ownership with their password before connecting Google.
      const local = await User.findOne({ email: payload.email, deletedAt: null });
      if (local) {
        if (local.provider === "google" && local.googleId && local.googleId !== payload.sub) {
          return res.status(409).json({ error: "That email is already linked to a different Google account." });
        }
        return res.status(200).json({
          needsConsent: true,
          email: local.email,
          displayName: local.displayName || "",
        });
      }
      if (intent === "signin") {
        return res.status(404).json({
          error: "No Swapt account is linked to this Google account yet. Create one on the sign-up page.",
        });
      }
      const base = payload.email.split("@")[0].replace(/[^a-z0-9._]/gi, "").slice(0, 20) || "user";
      let username = base;
      let n = 0;
      // Usernames are unique — disambiguate on collision.
      while (await User.findOne({ username })) {
        n += 1;
        username = `${base}${n}`.slice(0, 24);
      }
      user = new User({
        username,
        email: payload.email,
        displayName: payload.name || base,
        provider: "google",
        googleId: payload.sub,
        emailVerified: true, // Google already verified the email
        avatar: payload.picture ? { publicId: null, url: payload.picture } : undefined,
      });
      await user.save();
      await createWelcomeNotification(user);
      void sendWelcomeEmail(user.email, user.displayName || user.username, user.accent || "red").catch(() => {});
    }

    if (user.status === "suspended") return res.status(403).json({ error: "This account is suspended" });

    const { token: refreshToken } = await issueRefreshToken(user, req);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({
      user: user.toPublicJSON(),
      accessToken: signAccessToken(user),
      needsProfile: !googleProfileComplete(user),
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/auth/google/link — explicit consent to connect a Google identity
 * to an existing local account. The user proves ownership of the email by
 * entering its password; only then is `googleId` attached.
 */
router.post("/google/link", authLimiter, async (req, res, next) => {
  try {
    if (!googleClient) return res.status(503).json({ error: "Google sign-in isn't configured on the server." });

    const idToken = String(req.body?.idToken || "");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    if (!idToken || !email || !password) {
      return res.status(400).json({ error: "Missing Google token, email or password." });
    }

    const ticket = await googleClient.verifyIdToken({ idToken, audience: GOOGLE_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) return res.status(401).json({ error: "Google didn't return an email address." });
    if (payload.email_verified === false) {
      return res.status(401).json({ error: "That Google email address isn't verified." });
    }

    const user = await User.findOne({ email, deletedAt: null }).select("+passwordHash");
    if (!user) return res.status(404).json({ error: "No account found with that email address." });
    if (user.provider !== "local" || !user.passwordHash) {
      return res.status(400).json({ error: "That account isn't password-based. Log in with Google instead." });
    }
    if (!(await user.verifyPassword(password))) {
      return res.status(401).json({ error: "The password you entered is incorrect." });
    }
    if (user.googleId && user.googleId !== payload.sub) {
      return res.status(409).json({ error: "That account is already linked to a different Google profile." });
    }

    user.googleId = payload.sub;
    user.emailVerified = true; // Google already verified the email
    await user.save();

    const { token: refreshToken } = await issueRefreshToken(user, req);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
    res.json({
      user: user.toPublicJSON(),
      accessToken: signAccessToken(user),
      needsProfile: !googleProfileComplete(user),
    });
  } catch (err) { next(err); }
});

router.post("/refresh", async (req, res, next) => {
  try {
    const raw = req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken;
    if (!raw) return res.status(401).json({ error: "No refresh token" });

    const { token, user, persist } = await rotateRefreshToken(raw, req);
    res.cookie(REFRESH_COOKIE, token, refreshCookieOptions({ persist }));
    res.json({ user: user.toPublicJSON(), accessToken: signAccessToken(user) });
  } catch (err) { next(err); }
});

router.post("/logout", async (req, res, next) => {
  try {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await revokeAllForUser(req.user._id);
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Private profile JSON — public shape plus the member's own fit data. */
function privateProfileJSON(user) {
  return {
    ...user.toPublicJSON(),
    heightCm: user.heightCm ?? null,
    usualSize: user.usualSize ?? "",
    measurements: user.measurements ?? {},
    language: user.language ?? "",
    currency: user.currency ?? "",
    accent: user.accent || "red",
    swapAlerts: Boolean(user.swapAlerts ?? true),
    emailUpdates: Boolean(user.emailUpdates ?? true),
    marketing: Boolean(user.marketing ?? false),
    publicProfile: Boolean(user.publicProfile ?? true),
    showLocation: Boolean(user.showLocation ?? true),
  };
}

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: privateProfileJSON(req.user) });
});

router.patch("/me", requireAuth, async (req, res, next) => {
  try {
    const data = profileSchema.parse(req.body);
    Object.assign(req.user, data);
    await req.user.save();
    res.json({ user: privateProfileJSON(req.user) });
  } catch (err) { next(err); }
});

// Upload / replace the profile picture (multipart: field "image").
router.post("/me/avatar", requireAuth, upload.single("image"), validateImageUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image was uploaded." });
    const result = await uploadBuffer(req.file.buffer, { folder: "swapt/avatars" });

    const previous = req.user.avatar;
    req.user.avatar = { publicId: result.public_id, url: null };
    await req.user.save();

    // Free the old asset — but never delete the one we just uploaded.
    if (previous?.publicId && previous.publicId !== result.public_id) {
      try { await destroyAsset(previous.publicId); } catch { /* orphan cleanup is best-effort */ }
    }

    res.json({ user: req.user.toPublicJSON() });
  } catch (err) { next(err); }
});

// Remove the profile picture.
router.delete("/me/avatar", requireAuth, async (req, res, next) => {
  try {
    const previous = req.user.avatar;
    req.user.avatar = { publicId: null, url: null };
    await req.user.save();

    if (previous?.publicId) {
      try { await destroyAsset(previous.publicId); } catch { /* best-effort */ }
    }

    res.json({ user: req.user.toPublicJSON() });
  } catch (err) { next(err); }
});

// Change password
router.post("/password", requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body ?? {};
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });

    // If the user already has a password, require confirmation of currentPassword.
    const hasPassword = Boolean(user.passwordHash);
    if (hasPassword) {
      if (!(await user.verifyPassword(String(currentPassword ?? "")))) {
        return res.status(400).json({ error: "Your current password isn't correct." });
      }
    }

    if (String(newPassword ?? "").length < 8) return res.status(400).json({ error: "Password must be 8+ characters" });

    // Set the new password. If this was a Google (or other provider) account
    // with no prior password, promote them to a local-capable account so they
    // can also log in with email+password and use password reset flows.
    await user.setPassword(newPassword);
    if (!hasPassword) {
      user.provider = "local";
    }
    user.tokenVersion += 1; // revoke other sessions
    await user.save();

    // Security notice: whoever holds the inbox should know the password
    // changed, in case the session doing this wasn't actually theirs.
    // Don't send "password changed" on first-time set for Google users who never had a password — they just created one.
    if (hasPassword) {
      void sendPasswordChangedEmail(user.email, { method: "your account settings", accent: user.accent || "red" }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Soft delete — record is retained, account hidden and sign-in blocked.
router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!user) return res.status(404).json({ error: "User not found" });

    // Google users don't have a password; local users must verify theirs.
    if (user.provider === "local") {
      if (!(await user.verifyPassword(String(req.body?.password ?? "")))) {
        return res.status(400).json({ error: "Password confirmation failed." });
      }
    }

    const deletedEmail = user.email;
    const deletedUsername = user.username;
    const deletedAccent = user.accent || "red";
    user.deletedAt = new Date();
    user.tokenVersion += 1;
    await user.save();
    await revokeAllForUser(user._id);
    if (deletedEmail) void sendAccountDeletedEmail(deletedEmail, { username: deletedUsername, accent: deletedAccent }).catch(()=>{});
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;