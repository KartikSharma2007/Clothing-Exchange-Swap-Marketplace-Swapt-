import mongoose from "mongoose";

export const CATEGORIES = [
  "T-shirts", "Shirts & Blouses", "Tops", "Knitwear & Jumpers", "Hoodies & Sweatshirts",
  "Dresses", "Skirts", "Jeans", "Trousers", "Shorts", "Bottoms",
  "Jackets & Coats", "Outerwear", "Blazers & Suits", "Activewear", "Swimwear",
  "Loungewear & Sleepwear", "Shoes", "Sneakers", "Boots", "Bags", "Accessories",
  "Jewellery", "Hats & Caps", "Sunglasses", "Watches", "Vintage",
];
export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];
export const CONDITIONS = ["New with tags", "New", "Like new", "Good", "Fair"];
export const GENDERS = ["Womens", "Mens", "Unisex", "Kids"];

const imageSchema = new mongoose.Schema(
  { publicId: { type: String, required: true }, width: Number, height: Number, bytes: Number },
  { _id: false },
);

const listingSchema = new mongoose.Schema(
  {
    title: { type: String, required: function () { return this.status === "active"; }, trim: true, maxlength: 120 },
    brand: { type: String, required: function () { return this.status === "active"; }, trim: true, maxlength: 60 },
    description: { type: String, required: function () { return this.status === "active"; }, trim: true, maxlength: 2000 },
    category: { type: String, required: function () { return this.status === "active"; }, enum: CATEGORIES, index: true },
    gender: { type: String, required: true, enum: GENDERS, default: "Unisex" },
    size: { type: String, required: function () { return this.status === "active"; }, enum: SIZES, index: true },
    condition: { type: String, required: function () { return this.status === "active"; }, enum: CONDITIONS },
    color: { type: String, required: function () { return this.status === "active"; }, trim: true, maxlength: 40 },
    value: { type: Number, required: function () { return this.status === "active"; }, min: 0, max: 10000 },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    // Optional coordinates so the item can be browsed by distance and arranged
    // as a local meetup (instead of shipping). Stored as a GeoJSON Point.
    // No default on `type` — otherwise Mongoose always materialises
    // `{ type: "Point" }` (without coordinates) and the 2dsphere index rejects
    // every insert with "Can't extract geo keys" (code 16755).
    locationCoord: {
      type: { type: String, enum: ["Point"] },
      coordinates: { type: [Number] }, // [lng, lat]
    },
    /** True when the seller is willing to hand over the item in person. */
    meetup: { type: Boolean, default: false },
    retailValue: { type: Number, min: 0, max: 10000, default: null },
    material: { type: String, trim: true, maxlength: 40, default: "" },
    fit: { type: String, trim: true, maxlength: 30, default: "" },
    style: { type: String, trim: true, maxlength: 30, default: "" },
    pattern: { type: String, trim: true, maxlength: 30, default: "" },
    season: { type: String, trim: true, maxlength: 40, default: "" },
    care: { type: String, trim: true, maxlength: 200, default: "" },
    shippingDays: { type: String, trim: true, maxlength: 40, default: "" },
    swapPreferences: { type: String, trim: true, maxlength: 200, default: "" },
    quantity: { type: Number, min: 1, max: 50, default: 1 },
    /**
     * Units already reserved by an ACCEPTED swap. Prevents the same unit being
     * "sold" into multiple accepted swaps (and paid out multiple times): an
     * accept only succeeds while committedQuantity < quantity. Released on
     * decline/cancel and decremented again on completion.
     */
    committedQuantity: { type: Number, min: 0, default: 0 },
    tags: { type: [String], default: [] },
    measurements: {
      chest: { type: String, default: "" },
      waist: { type: String, default: "" },
      hips: { type: String, default: "" },
      length: { type: String, default: "" },
      inseam: { type: String, default: "" },
      shoulder: { type: String, default: "" },
      sleeve: { type: String, default: "" },
    },
    views: { type: Number, default: 0 },
    saves: { type: Number, default: 0 },
    images: {
      type: [imageSchema],
      validate: {
        validator: function (v) {
          // Draft/scheduled listings may be saved without photos; publish will enforce at least one.
          if (this.status === "draft" || this.status === "scheduled") return true;
          return Array.isArray(v) && v.length > 0;
        },
        message: "At least one image is required",
      },
    },
    seller: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["active", "swapped", "hidden", "draft", "scheduled"], default: "active", index: true },
    /** When set, a scheduled listing auto-publishes (draft→active) at this time. */
    publishAt: { type: Date, default: null, index: true },
    featured: { type: Boolean, default: false, index: true },
    featuredAt: { type: Date, default: null },
    featuredUntil: { type: Date, default: null, index: true },
    boostCount: { type: Number, default: 0 },
    /** Proactive moderation — every new listing is scanned synchronously. */
    moderationStatus: { type: String, enum: ["pending", "approved", "flagged", "rejected"], default: "approved", index: true },
    moderationReason: { type: String, trim: true, maxlength: 500, default: "" },
    moderationScore: { type: Number, min: 0, max: 100, default: 0 },
    flaggedAt: { type: Date, default: null },
    /** Return/refund policy per listing — strengthens dispute resolution with a clear window. */
    returnWindowDays: { type: Number, enum: [0, 7, 14, 30], default: 7 },
    returnPolicy: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

listingSchema.index({ title: "text", brand: "text", color: "text", description: "text" });
listingSchema.index({ locationCoord: "2dsphere" });

export const Listing = mongoose.model("Listing", listingSchema);
