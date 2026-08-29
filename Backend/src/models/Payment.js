import mongoose from "mongoose";

/**
 * Ledger for money movement. The marketplace trades in swap credits (a virtual
 * currency on the User), so every movement is recorded here with a direction
 * (from → to), a type and a gateway. When Stripe is configured, topping up
 * credits goes through a real checkout session; otherwise the top-up credits
 * the balance immediately (demo mode). Escrow hold/release/refund records are
 * created as swaps move through their lifecycle.
 */
export const PAYMENT_TYPES = [
  "topup",
  "escrow_hold",
  "escrow_release",
  "escrow_refund",
  "payout",
  "boost",
];

export const PAYMENT_STATUSES = ["pending", "completed", "failed", "refunded"];

const paymentSchema = new mongoose.Schema(
  {
    type: { type: String, enum: PAYMENT_TYPES, required: true, index: true },
    status: { type: String, enum: PAYMENT_STATUSES, default: "pending", index: true },
    /** Amount in credits (positive). For escrow this is the value held. */
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "credits" },
    /** Directional ledger entries: who gave and who received. */
    from: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    /** The swap this movement belongs to (escrow/payout records). */
    swap: { type: mongoose.Schema.Types.ObjectId, ref: "Swap", default: null, index: true },
    /** Gateway: "credits" (internal ledger) or "stripe" (checkout). */
    gateway: { type: String, enum: ["credits", "stripe"], default: "credits" },
    /** Stripe checkout session / payment intent id, when applicable. */
    gatewayRef: { type: String, default: "" },
    /** Human-readable receipt number, e.g. SWPT-2026-000123. */
    receiptNo: { type: String, unique: true, sparse: true },
    note: { type: String, trim: true, maxlength: 300, default: "" },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

paymentSchema.index({ from: 1, createdAt: -1 });
paymentSchema.index({ to: 1, createdAt: -1 });
// A gateway payment may be redelivered by the provider (Stripe webhook retries);
// the gateway reference is the natural unique key, so a re-delivered event can
// never credit the same payment twice. Partial: internal "credits" records have
// no gateway ref and must not be constrained.
paymentSchema.index({ gatewayRef: 1 }, { unique: true, partialFilterExpression: { gatewayRef: { $ne: "" } } });
// At most one pending escrow hold per swap. Two concurrent "accept" calls for
// the same swap race on this index: only one insert wins, so credits can never
// be deducted twice for the same swap (also safe on deployments without
// multi-document transactions).
paymentSchema.index(
  { swap: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: "escrow_hold", status: "pending" } },
);

/**
 * Next sequential receipt number, allocated atomically.
 *
 * Receipts are reserved from a small counter collection (`receiptcounters`,
 * one doc per year) so concurrent requests never mint the same number — the
 * previous countDocuments + 1 approach raced and could hit the unique index on
 * receiptNo (E11000 → 500) or mint duplicates. The counter is seeded past any
 * existing receipts the first time a year is seen so fresh numbers never
 * collide with historical data.
 */
paymentSchema.statics.nextReceiptNo = async function nextReceiptNo() {
  const year = new Date().getFullYear();
  const key = `receipt-${year}`;
  const counters = this.db.collection("receiptcounters");

  // Two separate writes instead of `{ $setOnInsert, $inc }` on the same `seq`
  // path: mixing both operators in one update is a MongoDB path conflict
  // (error 40, "Updating the path 'seq' would create a conflict") that crashed
  // every top-up and escrow hold with a 500.
  const existing = await this.countDocuments({ receiptNo: new RegExp(`^SWPT-${year}-`) });
  // Seed the counter on its first allocation for the year. `$setOnInsert` alone
  // is a no-op on every later call, and the atomic upsert means concurrent
  // requests never double-seed.
  await counters.updateOne(
    { _id: key },
    { $setOnInsert: { seq: existing } },
    { upsert: true },
  );
  // Claim the next number. `findOneAndUpdate` is atomic, so concurrent callers
  // each get a distinct sequence value.
  const doc = await counters.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { returnDocument: "after" },
  );
  const seq = doc?.seq ?? existing + 1;
  return `SWPT-${year}-${String(seq).padStart(6, "0")}`;
};

export const Payment = mongoose.model("Payment", paymentSchema);
