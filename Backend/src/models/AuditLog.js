import mongoose from "mongoose";

export const MODERATION_ACTIONS = [
  "listing.feature",
  "listing.unfeature",
  "listing.hide",
  "listing.restore",
  "listing.delete",
  "user.suspend",
  "user.restore",
  "user.report",
  "user.block",
  "user.unblock",
  "swap.dispute_open",
  "swap.dispute_resolved",
  "swap.refund",
  "user.phone_verified",
  "user.phone_verify_sent",
  "user.topup",
];

/**
 * Append-only moderation trail. Documents are never updated or deleted by the
 * app — admin screens read them to show who did what, when, and why.
 */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorUsername: { type: String, required: true },
    action: { type: String, enum: MODERATION_ACTIONS, required: true, index: true },
    targetType: { type: String, enum: ["listing", "user"], required: true },
    targetId: { type: String, required: true, index: true },
    targetLabel: { type: String, default: "" },
    reason: { type: String, trim: true, maxlength: 300, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);

/** Write a moderation entry. Never throws into the request path. */
export async function recordAudit(req, entry) {
  try {
    await AuditLog.create({
      actor: req.user._id,
      actorUsername: req.user.username,
      ip: req.ip,
      ...entry,
    });
  } catch (err) {
    console.error("[audit] failed to record", entry.action, err.message);
  }
}