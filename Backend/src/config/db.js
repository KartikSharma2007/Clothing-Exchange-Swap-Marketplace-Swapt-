import mongoose from "mongoose";

export async function connectDB(uri) {
  if (!uri) throw new Error("MONGODB_URI is not set");
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log("[db] connected to MongoDB Atlas");
  await cleanupGoogleIdNulls();
  await repairConversationPairIndex();
}

/**
 * One-time (idempotent) repair for a schema bug where local accounts were stored
 * with `googleId: null`. The sparse unique index on googleId still indexes the
 * literal null, so a second local signup collided with "That googleId is already
 * taken". Removing the stored null lets the sparse index skip local users.
 */
async function cleanupGoogleIdNulls() {
  const { User } = await import("../models/User.js");
  const res = await User.updateMany({ googleId: null }, { $unset: { googleId: 1 } });
  if (res.modifiedCount > 0) {
    console.log(`[db] cleaned ${res.modifiedCount} local account(s) with a stray null googleId`);
  }
}

/**
 * Critical index repair for the Conversation collection. The old schema declared
 * `{ members: 1, unique: true }` on an ARRAY field. MongoDB builds that as a
 * multikey index, where uniqueness applies to every element — so a user id could
 * only ever appear in one document and every second conversation (swap request)
 * was rejected with a 409. This migration:
 *   1. Backfills the new `pairKey` (sorted "a:b") on any existing threads.
 *   2. Drops the poisonous `members_1` unique multikey index.
 *   3. Creates the real unique index on `pairKey` plus a plain non-unique
 *      `members` index so `{ members: userId }` queries stay fast.
 * Idempotent: safe to run on every boot.
 */
async function repairConversationPairIndex() {
  const { Conversation, conversationPairKey } = await import("../models/Conversation.js");
  const missing = await Conversation.countDocuments({
    $or: [{ pairKey: { $exists: false } }, { pairKey: null }, { pairKey: "" }],
  });
  if (missing > 0) {
    const cursor = Conversation.find({
      $or: [{ pairKey: { $exists: false } }, { pairKey: null }, { pairKey: "" }],
    }).cursor();
    let fixed = 0;
    for await (const conv of cursor) {
      const [a, b] = conv.members;
      if (!a || !b) continue;
      await Conversation.updateOne(
        { _id: conv._id },
        { $set: { pairKey: conversationPairKey(a, b) } },
      );
      fixed += 1;
    }
    console.log(`[db] backfilled pairKey on ${fixed} conversation(s)`);
  }

  // Remove the unique multikey index that locks members to one conversation.
  try {
    await Conversation.collection.dropIndex("members_1");
    console.log("[db] dropped Conversation unique members_1 index");
  } catch (err) {
    if (!/index not found|not exist/i.test(String(err?.message ?? err))) throw err;
  }

  // The model has autoIndex disabled; build the indexes explicitly so the
  // unique pairKey index (with clean options) and the members lookup index
  // actually exist in Atlas.
  await Conversation.collection.createIndex({ pairKey: 1 }, { unique: true });
  await Conversation.collection.createIndex({ members: 1 });
  console.log("[db] Conversation indexes rebuilt (pairKey unique, members plain)");
}