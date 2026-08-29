import mongoose from "mongoose";

const watchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    lastValue: { type: Number, required: true },
    notifyPriceDrop: { type: Boolean, default: true },
    notifyRestock: { type: Boolean, default: true },
  },
  { timestamps: true }
);

watchSchema.index({ user: 1, listing: 1 }, { unique: true });

export const Watch = mongoose.model("Watch", watchSchema);
