import { Router } from "express";
import rateLimit from "express-rate-limit";
import { emailEnabled, sendTestEmail } from "../utils/email.js";
import { smsEnabled, sendSMS } from "../utils/sms.js";

const router = Router();

const devLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

// In production this whole router requires a shared secret so it can't be
// used to spam arbitrary inboxes/phones from the open internet. Set
// DEV_DEBUG_KEY in .env and pass it as ?key=... to use these in prod.
router.use((req, res, next) => {
  if (process.env.NODE_ENV !== "production") return next();
  const required = process.env.DEV_DEBUG_KEY;
  if (required && req.query.key === required) return next();
  return res.status(404).json({ error: "Not found" });
});

/**
 * GET /api/dev/test-email?to=you@example.com
 * Fires one real email through Brevo and returns whether it was accepted.
 * Full diagnostic detail (Brevo's exact error, unverified-sender warnings) is
 * printed to the server console by src/utils/email.js — check there too.
 */
router.get("/dev/test-email", devLimiter, async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).json({ error: "Pass ?to=you@example.com" });

  if (!emailEnabled) {
    return res.status(200).json({
      ok: false,
      emailEnabled: false,
      reason: "BREVO_API_KEY / BREVO_SENDER_EMAIL is not set (or wasn't picked up). Check Backend/.env exists and the server was restarted.",
    });
  }

  const sent = await sendTestEmail(to);
  res.json({
    ok: sent,
    emailEnabled: true,
    from: process.env.BREVO_SENDER_EMAIL || "(not set)",
    to,
    note: sent
      ? "Brevo accepted it — check the inbox (and spam folder)."
      : "Brevo rejected it or the request threw — see the server console for the exact [email] log line.",
  });
});

/**
 * GET /api/dev/test-sms?to=+919876543210
 * Same idea for Twilio.
 */
router.get("/dev/test-sms", devLimiter, async (req, res) => {
  const to = req.query.to;
  if (!to) return res.status(400).json({ error: "Pass ?to=+91XXXXXXXXXX" });

  if (!smsEnabled) {
    return res.status(200).json({
      ok: false,
      smsEnabled: false,
      reason: "Twilio isn't configured (need TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER or TWILIO_MESSAGING_SERVICE_SID).",
    });
  }

  const sent = await sendSMS(to, "This is a test SMS from your Swapt backend.");
  res.json({ ok: sent, smsEnabled: true, to });
});

export default router;