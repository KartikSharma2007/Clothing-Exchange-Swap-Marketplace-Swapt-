import mongoose from "mongoose";

/**
 * A member's bookmarked search. When `alertsEnabled` is on and a new listing
 * matches these filters, the owner gets a notification (and a web push if their
 * browser is subscribed).
 */
const savedSearchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, trim: true, maxlength: 60, default: "" },
    q: { type: String, trim: true, maxlength: 120, default: "" },
    cat: { type: String, trim: true, maxlength: 40, default: "" },
    size: { type: String, trim: true, maxlength: 5, default: "" },
    g: { type: String, trim: true, maxlength: 20, default: "" },
    brand: { type: String, trim: true, maxlength: 60, default: "" },
    tag: { type: String, trim: true, maxlength: 20, default: "" },
    /** Optional location filter — alert only on items near this point. */
    lat: { type: Number, min: -90, max: 90, default: null },
    lng: { type: Number, min: -180, max: 180, default: null },
    radiusKm: { type: Number, min: 1, max: 5000, default: null },
    /** Only alert on items the seller offers for local meetup. */
    meetupOnly: { type: Boolean, default: false },
    alertsEnabled: { type: Boolean, default: true },
    /** Only alert once per day per search so we don't spam a member. */
    lastAlertAt: { type: Date, default: null },
  },
  { timestamps: true },
);

savedSearchSchema.index({ user: 1, createdAt: -1 });

export const SavedSearch = mongoose.model("SavedSearch", savedSearchSchema);
