import mongoose from "mongoose";

export const REPORT_TARGETS = ["listing", "user"];
export const REPORT_REASONS = {
  listing: ["counterfeit", "prohibited", "misleading", "damaged", "unavailable", "other"],
  user: ["harassment", "scam", "inappropriate", "spam", "other"],
};

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true, index: true },
    target: { type: mongoose.Schema.Types.ObjectId, refPath: "targetRef", required: true, index: true },
    targetRef: { type: String, enum: ["Listing", "User"], required: true },
    reason: { type: String, trim: true, maxlength: 40, default: "other" },
    details: { type: String, trim: true, maxlength: 600, default: "" },
    status: { type: String, enum: ["open", "resolved"], default: "open", index: true },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    resolutionNote: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

// A member can report the same target more than once, but not spam-open the same reason.
reportSchema.index({ reporter: 1, target: 1, reason: 1, status: 1 });

export const Report = mongoose.model("Report", reportSchema);
