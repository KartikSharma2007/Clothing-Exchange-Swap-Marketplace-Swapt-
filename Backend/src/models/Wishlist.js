import mongoose from "mongoose";

const wishlistSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true, unique: true },
    items: [
      {
        listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
        addedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);

export const Wishlist = mongoose.model("Wishlist", wishlistSchema);
