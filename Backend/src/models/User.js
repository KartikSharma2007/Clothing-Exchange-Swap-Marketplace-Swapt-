import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { signedUrl } from "../config/cloudinary.js";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String, required: true, unique: true, trim: true,
      minlength: 3, maxlength: 24, match: /^[a-z0-9._]+$/i, index: true,
    },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 255 },
    passwordHash: {
      type: String,
      select: false,
      required: function requiredUnlessGoogle() { return this.provider !== "google"; },
    },

    // Auth provider — "local" accounts have a password, "google" accounts don't.
    provider: { type: String, enum: ["local", "google"], default: "local" },
    // No default here (NOT null): local users must not store the field at all, or
    // the sparse unique index still indexes "null" and blocks every local signup
    // after the first with "That googleId is already taken". Sparse only skips
    // documents where the field is MISSING.
    googleId: { type: String, unique: true, sparse: true, index: true },

    // Profile
    displayName: { type: String, trim: true, maxlength: 60, default: "" },
    bio: { type: String, trim: true, maxlength: 300, default: "" },
    location: { type: String, trim: true, maxlength: 120, default: "" },
    avatar: {
      publicId: { type: String, default: null },
      url: { type: String, default: null },
    },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    swaps: { type: Number, default: 0, min: 0 },
    /** % of terminal swaps (completed vs declined/cancelled) that completed. */
    reliability: { type: Number, default: null, min: 0, max: 100 },
    /** Number of terminal swaps the reliability score is based on. */
    reliabilitySample: { type: Number, default: 0, min: 0 },
    credits: { type: Number, default: 50, min: 0 },
    /** Credits currently locked in escrow on an accepted swap. */
    creditsHeld: { type: Number, default: 0, min: 0 },

    // Localisation preferences (client-side defaults live in the app; kept on
    // the profile so they survive across devices).
    language: { type: String, trim: true, maxlength: 10, default: "" },
    currency: { type: String, trim: true, maxlength: 10, default: "" },
    /** Marketplace accent theme — used to theme transactional emails to match the member's site choice (red/blue/green/black). */
    accent: { type: String, enum: ["red", "green", "blue", "black"], default: "red" },

    // Notification & privacy preferences — persisted here (not just the
    // browser) so they survive across devices and are actually enforced.
    /** Offers, replies and status changes on your swaps. */
    swapAlerts: { type: Boolean, default: true },
    /** Security alerts and important account updates (email). */
    emailUpdates: { type: Boolean, default: true },
    /** Marketing & drops (email). */
    marketing: { type: Boolean, default: false },
    /** Whether other members can view this profile and its listings. */
    publicProfile: { type: Boolean, default: true },
    /** Whether the member's city is shown on their profile / listings. */
    showLocation: { type: Boolean, default: true },

    // Personal blocks: users this member has blocked (unilateral — fully hidden,
    // can't contact). Muted users are softer: content still shows, but their
    // notifications are suppressed.
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    mutedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Authorization + moderation
    role: { type: String, enum: ["user", "admin"], default: "user", index: true },
    status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
    /** Last authenticated request (debounced to ~5 min) — powers "online now" in the admin console. */
    lastActiveAt: { type: Date, default: null, index: true },

    phone: { type: String, trim: true, maxlength: 24, default: "" },
    address: { type: String, trim: true, maxlength: 200, default: "" },
    /** Structured shipping profile for shipping swaps (legacy single — kept for backwards compat). */
    shippingProfile: {
      name: { type: String, trim: true, maxlength: 80, default: "" },
      line1: { type: String, trim: true, maxlength: 120, default: "" },
      line2: { type: String, trim: true, maxlength: 120, default: "" },
      city: { type: String, trim: true, maxlength: 80, default: "" },
      postal: { type: String, trim: true, maxlength: 20, default: "" },
      country: { type: String, trim: true, maxlength: 60, default: "" },
      phone: { type: String, trim: true, maxlength: 24, default: "" },
    },
    /** Multiple saved addresses — replaces single shippingProfile for frequent shippers. */
    shippingAddresses: [
      {
        label: { type: String, trim: true, maxlength: 40, default: "" }, // e.g. "Home", "Work"
        name: { type: String, trim: true, maxlength: 80, default: "" },
        line1: { type: String, trim: true, maxlength: 120, default: "" },
        line2: { type: String, trim: true, maxlength: 120, default: "" },
        city: { type: String, trim: true, maxlength: 80, default: "" },
        postal: { type: String, trim: true, maxlength: 20, default: "" },
        country: { type: String, trim: true, maxlength: 60, default: "" },
        phone: { type: String, trim: true, maxlength: 24, default: "" },
        isDefault: { type: Boolean, default: false },
      },
    ],
    /** Carrier preferences a member lists against ("ship with", "ships worldwide"). */
    preferredCarrier: { type: String, trim: true, maxlength: 40, default: "" },
    shipsWorldwide: { type: Boolean, default: false },
    age: { type: Number, min: 13, max: 120, default: null },
    /** Size & fit — used to flag "likely your fit" items across the catalog. */
    heightCm: { type: Number, min: 80, max: 260, default: null },
    usualSize: { type: String, trim: true, maxlength: 10, default: "" },
    measurements: {
      chest: { type: String, default: "" },
      waist: { type: String, default: "" },
      hips: { type: String, default: "" },
      length: { type: String, default: "" },
      inseam: { type: String, default: "" },
      shoulder: { type: String, default: "" },
      sleeve: { type: String, default: "" },
    },
    /** True once the member has verified their phone — shown as a trust badge. */
    phoneVerified: { type: Boolean, default: false },
    phoneVerifyCodeHash: { type: String, select: false, default: null },
    phoneVerifyExpiresAt: { type: Date, default: null },
    phoneVerifyAttempts: { type: Number, default: 0 },
    /** Seller verification badge — granted by an admin after identity review. */
    verifiedSeller: { type: Boolean, default: false },
    verifiedAt: { type: Date, default: null },
    /** Soft delete — hidden everywhere in the app, row retained in MongoDB. */
    deletedAt: { type: Date, default: null, index: true },

    resetPasswordTokenHash: { type: String, select: false, default: null },
    resetPasswordExpiresAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },
    emailVerifyTokenHash: { type: String, select: false, default: null },
    emailVerifyExpiresAt: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }, // bump to revoke all refresh tokens
  },
  { timestamps: true },
);

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  if (!this.passwordHash) return Promise.resolve(false); // Google-only account, no password set
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.methods.toPublicJSON = function toPublicJSON() {
  return {
    id: String(this._id),
    username: this.username,
    email: this.email,
    displayName: this.displayName || this.username,
    bio: this.bio,
    location: this.location,
    avatarUrl: this.avatar?.publicId
      ? signedUrl(this.avatar.publicId)
      : (this.avatar?.url ?? null),
    rating: this.rating,
    ratingCount: this.ratingCount,
    swaps: this.swaps,
    /** 0–100 completion rate, null until enough terminal swaps exist. */
    reliability: this.reliability ?? null,
    reliabilitySample: this.reliabilitySample ?? 0,
    credits: this.credits,
    creditsHeld: this.creditsHeld ?? 0,
    language: this.language || "",
    currency: this.currency || "",
    accent: this.accent || "red",
    role: this.role,
    status: this.status,
    phone: this.phone,
    address: this.address,
    shippingProfile: this.shippingProfile ?? {},
    shippingAddresses: (this.shippingAddresses ?? []).map((a) => ({
      id: String(a._id),
      label: a.label ?? "",
      name: a.name ?? "",
      line1: a.line1 ?? "",
      line2: a.line2 ?? "",
      city: a.city ?? "",
      postal: a.postal ?? "",
      country: a.country ?? "",
      phone: a.phone ?? "",
      isDefault: Boolean(a.isDefault),
    })),
    preferredCarrier: this.preferredCarrier ?? "",
    shipsWorldwide: Boolean(this.shipsWorldwide),
    age: this.age,
    /** Verified members get a trust badge on their profile. */
    phoneVerified: Boolean(this.phoneVerified),
    /** Admin-granted seller verification badge. */
    verifiedSeller: Boolean(this.verifiedSeller),
    verifiedAt: this.verifiedAt ?? null,
    provider: this.provider,
    emailVerified: Boolean(this.emailVerified),
    createdAt: this.createdAt,
  };
};

export const User = mongoose.model("User", userSchema);