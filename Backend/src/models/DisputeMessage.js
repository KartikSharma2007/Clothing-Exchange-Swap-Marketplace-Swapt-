import mongoose from "mongoose";

const disputeMessageSchema = new mongoose.Schema(
  {
    dispute: { type: mongoose.Schema.Types.ObjectId, ref: "Dispute", required: true, index: true },
    swap: { type: mongoose.Schema.Types.ObjectId, ref: "Swap", required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderUsername: { type: String, required: true },
    body: { type: String, trim: true, maxlength: 1000, default: "" },
    image: { type: String, default: null }, // Cloudinary publicId or url
  },
  { timestamps: true }
);

disputeMessageSchema.index({ dispute: 1, createdAt: 1 });

export const DisputeMessage = mongoose.model("DisputeMessage", disputeMessageSchema);
