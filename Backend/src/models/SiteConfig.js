import mongoose from "mongoose";

/**
 * Singleton site-level configuration. Currently holds the categories that
 * admins switch off in the admin console — disabled categories stop appearing
 * in browse results, facets and related suggestions until re-enabled.
 */
const siteConfigSchema = new mongoose.Schema(
  {
    key: { type: String, unique: true, default: "global" },
    disabledCategories: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const SiteConfig = mongoose.model("SiteConfig", siteConfigSchema);

/** Load the singleton config, creating it (empty) on first use. */
export async function getSiteConfig() {
  return SiteConfig.findOneAndUpdate(
    { key: "global" },
    { $setOnInsert: { key: "global", disabledCategories: [] } },
    { new: true, upsert: true },
  ).lean();
}