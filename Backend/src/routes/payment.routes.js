import crypto from "crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/User.js";
import { Payment } from "../models/Payment.js";
import { Swap } from "../models/Swap.js";
import { recordAudit } from "../models/AuditLog.js";

const router = Router();

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

/** Dynamic import keeps Stripe optional (only loaded when configured). */
async function stripe() {
  if (!STRIPE_SECRET) return null;
  const { default: Stripe } = await import("stripe");
  return new Stripe(STRIPE_SECRET);
}

/** Whether real payments are enabled (vs instant demo top-ups). */
export function paymentsConfigured() {
  return Boolean(STRIPE_SECRET);
}

/** Format a ledger entry for the member (direction relative to them). */
function serializePayment(p, userId) {
  const fromMe = String(p.from?._id ?? p.from) === String(userId);
  const toMe = String(p.to?._id ?? p.to) === String(userId);
  const credit = fromMe && !toMe ? "out" : "in";
  return {
    id: String(p._id),
    type: p.type,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    credit,
    from: p.from?.username ?? "Swapt",
    to: p.to?.username ?? "Swapt",
    gateway: p.gateway,
    gatewayRef: p.gatewayRef,
    receiptNo: p.receiptNo,
    note: p.note,
    swapId: p.swap ? String(p.swap) : null,
    createdAt: p.createdAt,
    completedAt: p.completedAt ? new Date(p.completedAt).toISOString() : null,
  };
}

/** GET /api/me/payments — the member's ledger (money in, money out). */
router.get("/me/payments", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const filter = { $or: [{ from: userId }, { to: userId }] };

    const [total, items, user] = await Promise.all([
      Payment.countDocuments(filter),
      Payment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("from", "username")
        .populate("to", "username"),
      User.findById(userId).select("credits creditsHeld"),
    ]);

    res.json({
      balance: user?.credits ?? 0,
      creditsHeld: user?.creditsHeld ?? 0,
      paymentsConfigured: paymentsConfigured(),
      items: items.map((p) => serializePayment(p, userId)),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) { next(err); }
});

/** GET /api/me/payments/:id — a single receipt. */
router.get("/me/payments/:id", requireAuth, async (req, res, next) => {
  try {
    const userId = req.user._id;
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: "Receipt not found" });
    const payment = await Payment.findOne({
      _id: req.params.id,
      $or: [{ from: userId }, { to: userId }],
    }).populate("from", "username displayName").populate("to", "username displayName");
    if (!payment) return res.status(404).json({ error: "Receipt not found" });

    const swap = payment.swap ? await Swap.findById(payment.swap).select("status createdAt") : null;
    res.json({
      payment: {
        ...serializePayment(payment, userId),
        counterparty: String(payment.to?._id ?? payment.to) === String(userId)
          ? (payment.from?.displayName || payment.from?.username)
          : (payment.to?.displayName || payment.to?.username),
        swapStatus: swap?.status ?? null,
      },
    });
  } catch (err) { next(err); }
});

/**
 * POST /api/me/payments/topup — buy more swap credits.
 * When Stripe is configured this creates a Checkout Session and returns its
 * URL; otherwise (demo) the credits are credited instantly.
 */
router.post("/me/payments/topup", requireAuth, async (req, res, next) => {
  try {
    const { amount } = z.object({ amount: z.coerce.number().int().min(10).max(10000) }).parse(req.body ?? {});
    const userId = req.user._id;

    if (STRIPE_SECRET) {
      const Stripe = await stripe();
      const origin = process.env.CLIENT_ORIGIN?.split(",")[0] ?? "http://localhost:3000";
      const session = await Stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [{
          price_data: {
            currency: "usd",
            product_data: { name: `${amount} Swapt credits` },
            // Stripe unit_amount is the SMALLEST currency unit (cents). Charging
            // `amount` directly billed 1/100th of the price — "$10 of credits"
            // cost $0.10. One credit is priced at one cent × 100 = $1 per credit.
            unit_amount: amount * 100,
          },
          quantity: 1,
        }],
        success_url: `${origin}/wallet?topup=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/wallet`,
        metadata: { userId: String(userId), amount: String(amount) },
      });
      return res.json({ checkoutUrl: session.url });
    }

    // Demo mode — credit instantly and log a receipt. ONLY when explicitly
    // enabled with DEMO_TOPUPS=1. This used to be gated on `NODE_ENV !==
    // "production"`, and the README's own .env template ships
    // NODE_ENV=development — so any instance set up from the README silently
    // became an unlimited free-credits faucet (top-up, receive credits, no
    // payment, repeat). An explicit opt-in flag can't be enabled by accident.
    if (process.env.DEMO_TOPUPS !== "1") {
      return res.status(503).json({
        error: "Payments are not configured. Top-ups are unavailable right now — please try again later.",
      });
    }
    const receiptNo = await Payment.nextReceiptNo();
    const payment = await Payment.create({
      type: "topup",
      status: "completed",
      amount,
      from: userId,
      to: userId,
      gateway: "credits",
      receiptNo,
      note: "Demo top-up — Stripe not configured.",
      completedAt: new Date(),
    });
    await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
    const user = await User.findById(userId).select("credits creditsHeld");
    res.json({ ok: true, balance: user?.credits ?? 0, receiptId: String(payment._id) });
  } catch (err) { next(err); }
});

/** POST /api/payments/stripe-webhook — confirm a checkout and credit credits. */
router.post("/stripe-webhook", async (req, res, next) => {
  try {
    if (!STRIPE_SECRET || !STRIPE_WEBHOOK_SECRET) return res.status(400).json({ error: "Stripe not configured" });
    const Stripe = await stripe();
    const signature = req.headers["stripe-signature"] ?? "";
    let event;
    try {
      event = Stripe.webhooks.constructEvent(req.rawBody ?? "", signature, STRIPE_WEBHOOK_SECRET);
    } catch {
      return res.status(400).json({ error: "Invalid signature" });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      // Async payment methods (bank transfers, some wallets) fire this event
      // BEFORE the funds have actually cleared. Credits must only move once the
      // payment is really paid — never on a session that may still fail. When
      // the funds do clear Stripe sends `checkout.session.async_payment_succeeded`
      // (handled below), so we simply ack the pending session here.
      if (session.payment_status !== "paid") {
        return res.json({ received: true });
      }
      await creditStripeSession(session);
    }

    if (event.type === "checkout.session.async_payment_succeeded") {
      // Bank transfers / some wallets: the money landed in our Stripe balance.
      // `session.payment_status` is "paid" on this event. Without this handler
      // those payers' credits were silently lost.
      await creditStripeSession(event.data.object);
    }
    res.json({ received: true });
  } catch (err) { next(err); }
});

/**
 * Credit a member's balance for a completed Stripe checkout session. Idempotent:
 * the unique index on `gatewayRef` means a redelivered webhook (Stripe retries
 * when a response is lost) can never double-credit.
 */
async function creditStripeSession(session) {
  const userId = session.metadata?.userId;
  // Credits bought = the amount chosen at checkout (metadata.amount),
  // which we charged as `amount × 100` cents. `amount_total` is in cents,
  // so it's only used as a fallback for older sessions, divided back to
  // the credit count.
  const amount = Number(session.metadata?.amount ?? Math.round((session.amount_total ?? 0) / 100));
  if (!userId || !(amount > 0)) return;
  try {
    const receiptNo = await Payment.nextReceiptNo();
    await Payment.create({
      type: "topup",
      status: "completed",
      amount,
      from: userId,
      to: userId,
      gateway: "stripe",
      gatewayRef: session.id,
      receiptNo,
      note: "Stripe checkout — swap credits.",
      completedAt: new Date(),
    });
    await User.updateOne({ _id: userId }, { $inc: { credits: amount } });
    void recordAudit({ user: { _id: userId } }, {
      action: "user.topup",
      targetType: "user",
      targetId: String(userId),
      targetLabel: "credits",
      reason: `Stripe top-up of ${amount} credits`,
    });
  } catch (err) {
    // The unique index on gatewayRef rejects a redelivered event — Stripe
    // may retry a webhook whose response was lost. A duplicate key means
    // this payment was already credited, so swallow it and ack.
    if (err?.code === 11000) return;
    throw err;
  }
}

export default router;
