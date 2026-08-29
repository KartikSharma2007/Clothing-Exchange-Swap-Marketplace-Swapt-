import mongoose from "mongoose";
import { User } from "../models/User.js";
import { Payment } from "../models/Payment.js";

/**
 * Escrow ledger for swaps. When a swap is accepted the requester's credits for
 * the *net* value they owe (requested listing minus anything they offered as
 * clothing) move into escrow (held). On completion they release to the owner;
 * on decline/cancel they refund to the requester. Every movement is recorded
 * in the Payment ledger so both members get a receipt.
 *
 * All helpers are transaction-aware: pass `{ session }` from the caller so the
 * balance changes + ledger rows commit (or roll back) atomically with the swap
 * status change. They throw on real failures so the surrounding transaction
 * aborts — money must never silently drift.
 */

async function userIdOf(refOrDoc) {
  const raw = refOrDoc?._id ?? refOrDoc;
  if (raw == null || raw === "undefined" || raw === "null") return null;
  const id = String(raw).trim();
  if (!id || id === "[object Object]" || !mongoose.isValidObjectId(id)) return null;
  return id;
}

function numericAmount(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

async function valueOfListing(listing) {
  return safeNumber(listing?.value ?? 0);
}

/**
 * Net credits the requester actually owes for this swap: the requested
 * listing's value minus the value of any clothing they offered in return.
 * Offering an item of equal value means nothing is held.
 *
 * The net is computed from the values SNAPSHOTTED onto the swap when it was
 * proposed/countered, never from the live (user-editable) listing values — a
 * member must not be able to change how much is held by editing a listing
 * mid-negotiation.
 */
export async function netCreditsForSwap(swap) {
  if (swap?.requestedValue != null || swap?.offeredValue != null) {
    const requested = safeNumber(swap?.requestedValue ?? swap?.requestedListing?.value ?? 0);
    const offered = safeNumber(swap?.offeredValue ?? 0);
    return Math.max(0, requested - offered);
  }
  // Fallback for swaps created before value snapshots existed.
  const requested = await valueOfListing(swap.requestedListing);
  let offered = 0;
  if (Array.isArray(swap.offeredListings) && swap.offeredListings.length && typeof swap.offeredListings[0] === "object" && swap.offeredListings[0].value != null) {
    offered = swap.offeredListings.reduce((s, d) => s + safeNumber(d.value ?? 0), 0);
  } else if (swap.offeredListing) {
    offered = await valueOfListing(swap.offeredListing);
  }
  return Math.max(0, requested - offered);
}

/** Hold the requester's net credits (on accept). Idempotent per swap. */
export async function escrowHold(swap, listing, opts = {}) {
  const { session } = opts;
  const swapId = swap?._id ?? swap;
  const requesterId = await userIdOf(swap?.requester);
  const ownerId = await userIdOf(swap?.owner);
  if (!swapId || !requesterId || !ownerId) {
    const err = new Error("This swap is missing the required participant data, so escrow cannot be created.");
    err.status = 400;
    throw err;
  }

  // Only the net amount is held (the requester may have offered clothing).
  const value = await netCreditsForSwap(swap);
  if (!Number.isFinite(value) || value <= 0) return null;

  if (!Number.isFinite(value) || value <= 0 || !requesterId || !ownerId) {
    const err = new Error("This swap is missing the required escrow data, so escrow cannot be created.");
    err.status = 400;
    throw err;
  }

  const requester = await User.findById(requesterId).select("credits creditsHeld").session(session ?? null);
  if (!requester) return null;
  const amount = numericAmount(value);
  if (!amount) {
    const err = new Error("This swap is missing a valid credit amount, so escrow cannot be created.");
    err.status = 400;
    throw err;
  }
  // A partial hold would silently short the owner on completion — the swap
  // must not be accepted until the full net value is available. Throw so the
  // caller's transaction aborts and the user sees the reason.
  if ((requester.credits ?? 0) < amount) {
    const err = new Error(`This swap requires ${value} credits in escrow, but the requester has ${requester.credits ?? 0}. Top up their balance first.`);
    err.status = 400;
    throw err;
  }

  // First-wins reservation: the unique partial index on (swap, escrow_hold,
  // pending) guarantees only ONE pending hold per swap. A concurrent accept
  // of the same swap loses this insert BEFORE touching any balance, so credits
  // are never deducted twice — even without a wrapping transaction.
  let hold;
  try {
    // NOTE: Payment.create(doc, opts) — when `doc` is a single (non-array)
    // object — is NOT "create this doc with these options" in Mongoose.
    // Mongoose's create() is variadic: a non-array first argument means every
    // positional argument is treated as its own document to insert. So the
    // `{ session }` object was being validated as a SECOND Payment document —
    // one with no type/amount/from — which is exactly the
    // "Path `from` is required.; Path `amount` is required.; Path `type` is
    // required." error. Wrapping the doc in an array is what tells Mongoose
    // the next argument is options, not another document.
    [hold] = await Payment.create(
      [
        {
          type: "escrow_hold",
          status: "pending",
          amount: amount,
          from: requesterId,
          to: ownerId,
          swap: swapId,
          gateway: "credits",
          receiptNo: await Payment.nextReceiptNo(),
          note: `Escrow held for swap (${amount} credits owed)`,
          completedAt: new Date(),
        },
      ],
      { session: session ?? undefined },
    );
  } catch (err) {
    if (err?.code === 11000) {
      const conflict = new Error("This swap has already been updated — refresh and try again.");
      conflict.status = 409;
      throw conflict;
    }
    if (err?.name === "ValidationError") {
      const details = Object.values(err.errors ?? {})
        .map((e) => e?.message)
        .filter(Boolean)
        .join("; ");
      const validationErr = new Error(details || "Payment validation failed while creating escrow.");
      validationErr.status = 400;
      throw validationErr;
    }
    throw err;
  }

  // Only the request that won the hold deducts the requester's balance. If the
  // deduction somehow fails, remove the hold record rather than leave a credit
  // entry that no balance backs.
  try {
    requester.credits = (requester.credits ?? 0) - amount;
    requester.creditsHeld = (requester.creditsHeld ?? 0) + amount;
    await requester.save({ session: session ?? undefined });
  } catch (err) {
    await Payment.deleteOne({ _id: hold._id }, { session: session ?? undefined }).catch(() => {});
    throw err;
  }
  return hold;
}

/** Release escrowed credits to the owner (on completed). */
export async function escrowRelease(swap, opts = {}) {
  const { session } = opts;
  const hold = await Payment.findOne({ swap: swap._id ?? swap, type: "escrow_hold", status: "pending" }).session(session ?? null);
  if (!hold || !hold.from || !hold.to || !hold.amount || !hold.type) return null;

  if (hold.to) {
    await User.updateOne({ _id: hold.to }, { $inc: { credits: hold.amount } }, { session: session ?? null });
  }
  if (hold.from) {
    await User.updateOne(
      { _id: hold.from },
      [{ $set: { creditsHeld: { $max: [{ $subtract: [{ $ifNull: ["$creditsHeld", 0] }, hold.amount] }, 0] } } }],
      { session: session ?? null },
    );
  }

  hold.status = "completed";
  hold.note = "Escrow released to the owner on completion.";
  hold.completedAt = new Date();
  await hold.save({ session: session ?? undefined });

  const receiptNo = await Payment.nextReceiptNo();
  // See the note in escrowHold() above — Payment.create(doc, opts) requires
  // doc to be wrapped in an array for opts (session) to be recognized as
  // options rather than a second document.
  const [release] = await Payment.create(
    [
      {
        type: "escrow_release",
        status: "completed",
        amount: hold.amount,
        from: hold.from,
        to: hold.to,
        swap: hold.swap,
        gateway: "credits",
        receiptNo,
        note: "Swap completed — escrow released.",
        completedAt: new Date(),
      },
    ],
    { session: session ?? undefined },
  );
  return release;
}

/** Return escrowed credits to the requester (on decline/cancel). */
export async function escrowRefund(swap, note = "", opts = {}) {
  const { session } = opts;
  const hold = await Payment.findOne({ swap: swap._id ?? swap, type: "escrow_hold", status: "pending" }).session(session ?? null);
  if (!hold || !hold.from || !hold.to || !hold.amount || !hold.type) return null;

  if (hold.from) {
    await User.updateOne(
      { _id: hold.from },
      [
        {
          $set: {
            credits: { $add: [{ $ifNull: ["$credits", 0] }, hold.amount] },
            creditsHeld: { $max: [{ $subtract: [{ $ifNull: ["$creditsHeld", 0] }, hold.amount] }, 0] },
          },
        },
      ],
      { session: session ?? null },
    );
  }

  hold.status = "refunded";
  hold.note = note || "Escrow refunded — swap did not complete.";
  hold.completedAt = new Date();
  await hold.save({ session: session ?? undefined });

  const receiptNo = await Payment.nextReceiptNo();
  // See the note in escrowHold() above — Payment.create(doc, opts) requires
  // doc to be wrapped in an array for opts (session) to be recognized as
  // options rather than a second document.
  const [refund] = await Payment.create(
    [
      {
        type: "escrow_refund",
        status: "completed",
        amount: hold.amount,
        from: hold.to,
        to: hold.from,
        swap: hold.swap,
        gateway: "credits",
        receiptNo,
        note: hold.note,
        completedAt: new Date(),
      },
    ],
    { session: session ?? undefined },
  );
  return refund;
}

/** Resolve any open escrow on a swap. Throws so the caller's transaction aborts. */
export async function settleEscrow(swap, status, opts = {}) {
  if (!swap) return;
  if (status === "completed") {
    await escrowRelease(swap, opts);
  } else if (status === "declined" || status === "cancelled") {
    await escrowRefund(swap, "", opts);
  }
}

/** Whether a swap currently holds credits in escrow. */
export async function escrowForSwap(swapId) {
  return Payment.findOne({ swap: swapId, type: "escrow_hold", status: "pending" })
    .select("amount status from to createdAt receiptNo")
    .lean();
}