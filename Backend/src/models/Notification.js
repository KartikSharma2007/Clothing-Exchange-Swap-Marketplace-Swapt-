import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    kind: {
      type: String,
      enum: ["like", "swap_request", "swap_accepted", "message", "sold", "announcement", "welcome", "search_alert", "swap_match", "watch_alert", "dispute_message"],
      required: true,
      index: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 500 },
    href: { type: String, default: null },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

export const Notification = mongoose.model("Notification", notificationSchema);
