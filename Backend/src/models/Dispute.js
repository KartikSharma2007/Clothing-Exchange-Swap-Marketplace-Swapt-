import mongoose from "mongoose";

export const DISPUTE_REASONS = [
  "Item not received",
  "Item not as described",
  "Damaged in transit",
  "Counterfeit / fake",
  "No-show",
  "Harassment",
  "Other",
];

/** How the dispute was decided. refund → credits back to requester, release →
 *  credits to owner, none → no credits move. */
export const DISPUTE_OUTCOMES = ["none", "refund_requester", "release_owner"];

const disputeSchema = new mongoose.Schema(
  {
    swap: { type: mongoose.Schema.Types.ObjectId, ref: "Swap", required: true, index: true },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    reason: { type: String, trim: true, maxlength: 60, default: "Other" },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, trim: true, maxlength: 500, default: "" },
    /** How escrow (if any) was settled by the moderator. */
    outcome: { type: String, enum: DISPUTE_OUTCOMES, default: "none" },
    /** Evidence the participants upload (photos, receipts). */
    evidence: [
      {
        publicId: { type: String, default: "" },
        url: { type: String, default: "" },
        width: { type: Number, default: 0 },
        height: { type: Number, default: 0 },
        bytes: { type: Number, default: 0 },
        by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        caption: { type: String, trim: true, maxlength: 160, default: "" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    /** Mediation trail: opened, evidence added, notes, resolved. */
    timeline: [
      {
        at: { type: Date, default: Date.now },
        actor: { type: String, default: "" },
        action: { type: String, default: "" },
        note: { type: String, trim: true, maxlength: 500, default: "" },
      },
    ],
  },
  { timestamps: true },
);

disputeSchema.index({ swap: 1, status: 1 });

export const Dispute = mongoose.model("Dispute", disputeSchema);