import mongoose from "mongoose";

/**
 * One row per (listing, viewer) so a single person or anonymous session counts
 * a listing's view at most once. The view counter route used to `$inc` on every
 * POST with no auth and no dedupe, so any bot could pump `views` (which feeds
 * "most-viewed", trending and relevance) by re-firing the endpoint.
 *
 * `viewerKey` is "user:<id>" for signed-in members and "ip:<address>" for
 * anonymous visitors. The unique index is what makes repeated hits a no-op:
 * the route catches the E11000 and skips the increment.
 */
const listingViewSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true },
    viewerKey: { type: String, required: true, maxlength: 160 },
  },
  { timestamps: true },
);

// One view per (listing, viewer), regardless of how many times the endpoint
// is hit — this is the whole point of the model.
listingViewSchema.index({ listing: 1, viewerKey: 1 }, { unique: true });

export const ListingView = mongoose.model("ListingView", listingViewSchema);
