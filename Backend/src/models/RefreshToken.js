import mongoose from "mongoose";

// Refresh tokens are stored hashed and rotate on every use, so a stolen
// token can be detected (reuse) and the whole family revoked.
const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    // Whether the user chose "keep me logged in" (persistent) or a session.
    persist: { type: Boolean, default: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    // The user's tokenVersion when this token was issued. A mismatch on
    // rotation means the user changed their password — kill the whole family.
    tokenVersion: { type: Number, default: 0 },
    userAgent: { type: String, default: "" },
    ip: { type: String, default: "" },
  },
  { timestamps: true },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
