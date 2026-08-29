import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 600, default: "" },
    // Optional photos attached to the review (Cloudinary publicIds).
    images: [
      {
        publicId: { type: String, required: true },
        width: { type: Number, default: null },
        height: { type: Number, default: null },
        bytes: { type: Number, default: null },
      },
    ],
    // The seller's public reply — one per review, editable.
    response: {
      body: { type: String, trim: true, maxlength: 600, default: "" },
      createdAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

// One review per author per listing.
reviewSchema.index({ listing: 1, author: 1 }, { unique: true });

export const Review = mongoose.model("Review", reviewSchema);
