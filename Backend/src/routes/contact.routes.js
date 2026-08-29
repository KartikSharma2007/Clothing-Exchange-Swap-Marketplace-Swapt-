import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ContactMessage } from "../models/ContactMessage.js";
import { User } from "../models/User.js";
import { contactSchema } from "../utils/validators.js";
import { sendContactReceivedEmail, sendContactAdminAlertEmail } from "../utils/email.js";

const router = Router();

// The contact form writes a database row on every request and is public (no
// auth), so an attacker could flood the support inbox with spam rows. Five
// requests per IP per 15 minutes is plenty for a human filing a real ticket.
const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Too many support requests — please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * POST /api/contact — file a support request. Public (signed-out users can ask
 * about a deactivated account). Persisted so support can actually read it, and
 * a short ticket reference is returned for the user's confirmation screen.
 */
router.post("/contact", contactLimiter, async (req, res, next) => {
  try {
    const data = contactSchema.parse(req.body);
    const doc = await ContactMessage.create(data);
    const ticketId = `SWPT-${String(doc._id).slice(-6).toUpperCase()}`;

    // Best-effort — a broken email provider should never fail the ticket itself.
    let accent = "red";
    try { const found = await User.findOne({ email: data.email }).select("accent"); if (found?.accent) accent = found.accent; } catch {}
    void sendContactReceivedEmail(data.email, { ticketId, message: data.message, accent }).catch(() => {});
    void sendContactAdminAlertEmail({ ...data, ticketId }).catch(() => {});

    res.status(201).json({ ok: true, ticketId });
  } catch (err) { next(err); }
});

export default router;