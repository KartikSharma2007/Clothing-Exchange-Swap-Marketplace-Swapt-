import mongoose from "mongoose";

/**
 * A conversation between two members. Swaps belong to a conversation so that a
 * new swap request between the same two people continues the same chat thread
 * instead of starting a fresh one.
 *
 * Uniqueness is enforced on `pairKey` (a sorted "a:b" of the two member ids),
 * NOT on the `members` array: a unique index on an array field is a multikey
 * index, which forbids any user id from appearing in more than one document.
 * That would lock every member into a single conversation for life. `members`
 * stays as a plain (non-unique) array so `{ members: userId }` lookups keep
 * working. `autoIndex` is disabled and the pairKey unique index is built
 * explicitly in config/db.js after the migration backfills existing rows.
 */
const conversationSchema = new mongoose.Schema(
  {
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
    /** Sorted "memberA:memberB" ids — the real uniqueness key for a pair. */
    pairKey: { type: String, required: true },
    lastMessageAt: { type: Date, default: Date.now },
    // Members who deleted this thread from their dashboard — the conversation
    // and its messages stay intact for the other member, it's just hidden here.
    hiddenFor: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
  },
  { timestamps: true, autoIndex: false },
);

conversationSchema.index({ members: 1 });

/** Deterministic key for a member pair, independent of argument order. */
export function conversationPairKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}

export const Conversation = mongoose.model("Conversation", conversationSchema);