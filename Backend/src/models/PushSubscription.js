import mongoose from "mongoose";

/** A browser push subscription (Web Push / VAPID) for one of a member's devices. */
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    endpoint: { type: String, required: true, maxlength: 512 },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, maxlength: 255, default: "" },
  },
  { timestamps: true },
);

// A browser re-uses the same endpoint when it re-subscribes; keep one row per endpoint.
pushSubscriptionSchema.index({ user: 1, endpoint: 1 }, { unique: true });

export const PushSubscription = mongoose.model("PushSubscription", pushSubscriptionSchema);
