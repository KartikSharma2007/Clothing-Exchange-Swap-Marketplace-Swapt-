import mongoose from "mongoose";

/**
 * A support request filed through the public /contact page. Kept separate from
 * Report (moderation) — this is the "my account was deactivated / I can't
 * access my stuff" inbox.
 */
const contactMessageSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80, default: "" },
    email: { type: String, trim: true, lowercase: true, maxlength: 255, required: true },
    topic: { type: String, trim: true, maxlength: 60, default: "" },
    message: { type: String, trim: true, maxlength: 4000, required: true },
  },
  { timestamps: true },
);

contactMessageSchema.index({ email: 1, createdAt: -1 });

export const ContactMessage = mongoose.model("ContactMessage", contactMessageSchema);