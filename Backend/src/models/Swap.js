import mongoose from "mongoose";

export const SWAP_STATUSES = ["pending", "accepted", "declined", "completed", "cancelled"];

/** Delivery states for a shipping swap (shipping = not meetup). */
export const SHIPPING_STATUSES = ["awaiting_shipment", "shipped", "in_transit", "delivered", "exception"];

const swapSchema = new mongoose.Schema(
  {
    // The member who proposed the swap
    requester: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    // The owner of the requested listing
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedListing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    offeredListing: { type: mongoose.Schema.Types.ObjectId, ref: "Listing", default: null },
    // Bundle support — 2-3 items for 1 (Depop/Vinted style). Keeps single offeredListing for backwards compat.
    offeredListings: [{ type: mongoose.Schema.Types.ObjectId, ref: "Listing" }],
    // Value of each side SNAPSHOTTED when the swap was proposed/countered.
    // Escrow is computed from these, never from live listing values, so a
    // member can't change the deal by editing a listing mid-negotiation.
    requestedValue: { type: Number, min: 0, default: null },
    offeredValue: { type: Number, min: 0, default: null },
    // The shared conversation between the two members this swap belongs to.
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", index: true },
    message: { type: String, trim: true, maxlength: 500, default: "" },
    status: { type: String, enum: SWAP_STATUSES, default: "pending", index: true },
    completedAt: { type: Date, default: null },
    // Local meetup exchange (instead of shipping).
    meetup: { type: Boolean, default: false },
    meetupPlace: { type: String, trim: true, maxlength: 160, default: "" },
    meetupTime: { type: Date, default: null },
    meetupLat: { type: Number, default: null },
    meetupLng: { type: Number, default: null },
    // Shipping exchange: true when the swap ships (meetup === false).
    shipping: { type: Boolean, default: false },
    // Preferred/selected carrier (e.g. "usps", "ups", "fedex", "dhl", "royalmail").
    carrier: { type: String, trim: true, maxlength: 40, default: "" },
    trackingNumber: { type: String, trim: true, maxlength: 120, default: "" },
    // Shipping stage — set when a carrier + tracking number is recorded.
    shippingStatus: { type: String, enum: SHIPPING_STATUSES, default: null },
    // Demo-generated label PDF/PNG URL (when a provider isn't configured).
    labelUrl: { type: String, trim: true, default: "" },
    // Pending requests auto-cancel when this passes (7 days). Cleared once the
    // swap leaves "pending" so a counter-offer gets a fresh window.
    expiresAt: { type: Date, default: null },
    // When the owner last sent a counter-offer on a pending swap.
    counteredAt: { type: Date, default: null },
    // Set once the requester confirms they physically received the item —
    // required before either party can mark the swap completed (the proof the
    // exchange happened, for shipping and meetup swaps alike).
    receiptConfirmedAt: { type: Date, default: null },
    // Shipping address selected from the requester's saved addresses (snapshot at propose time).
    shippingAddress: {
      label: { type: String, trim: true, maxlength: 40, default: "" },
      name: { type: String, trim: true, maxlength: 80, default: "" },
      line1: { type: String, trim: true, maxlength: 120, default: "" },
      line2: { type: String, trim: true, maxlength: 120, default: "" },
      city: { type: String, trim: true, maxlength: 80, default: "" },
      postal: { type: String, trim: true, maxlength: 20, default: "" },
      country: { type: String, trim: true, maxlength: 60, default: "" },
      phone: { type: String, trim: true, maxlength: 24, default: "" },
    },
  },
  { timestamps: true },
);

swapSchema.index({ requester: 1, createdAt: -1 });
swapSchema.index({ owner: 1, createdAt: -1 });
swapSchema.index({ status: 1, expiresAt: 1 });

export const Swap = mongoose.model("Swap", swapSchema);
