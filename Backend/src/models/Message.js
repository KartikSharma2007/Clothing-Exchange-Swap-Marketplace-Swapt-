import mongoose from "mongoose";

/**
 * A single message in a conversation. Messages are scoped to the conversation
 * (one per member pair). Swap messages belong to the swap that created them so
 * a status change on a later swap shows up in the same thread; plain-text
 * messages (no swap attached) are how members chat before proposing a swap.
 */
const messageSchema = new mongoose.Schema(
  {
    swap: { type: mongoose.Schema.Types.ObjectId, ref: "Swap", default: null, index: true },
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    senderUsername: { type: String, default: "" },
    // "text" = member message, "system" = status change note written by the app
    kind: { type: String, enum: ["text", "system"], default: "text" },
    body: { type: String, trim: true, maxlength: 1000, default: "" },
    // Optional photo on a text message (Cloudinary publicId). A message may
    // carry only an image, only text, or both — the route enforces that.
    image: { type: String, trim: true, default: "" },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ conversation: 1, createdAt: 1 });
messageSchema.index({ swap: 1, createdAt: 1 });

export const Message = mongoose.model("Message", messageSchema);
