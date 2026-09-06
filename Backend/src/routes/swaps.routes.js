import { Router } from "express";
import { Swap } from "../models/Swap.js";
import { signedUrl } from "../config/cloudinary.js";

const router = Router();

function listingCard(listing) {
  if (!listing) return null;
  return {
    id: String(listing._id),
    title: listing.title,
    brand: listing.brand,
    description: listing.description ?? "",
    category: listing.category,
    gender: listing.gender,
    size: listing.size,
    condition: listing.condition,
    color: listing.color,
    value: listing.value,
    location: listing.location,
    images: (listing.images ?? []).map((image) => signedUrl(image.publicId)),
    seller: listing.seller
      ? {
          name: listing.seller.displayName || listing.seller.username || "Swapt member",
          username: listing.seller.username || "",
          rating: listing.seller.rating ?? 0,
          swaps: listing.seller.swaps ?? 0,
        }
      : { name: "Swapt member", username: "", rating: 0, swaps: 0 },
    postedDaysAgo: listing.createdAt
      ? Math.max(0, Math.floor((Date.now() - new Date(listing.createdAt).getTime()) / 86400000))
      : 0,
    tags: listing.tags ?? [],
    views: listing.views ?? 0,
    saves: listing.saves ?? 0,
  };
}

/** GET /api/swaps/recent — public feed of the latest completed swaps. */
router.get("/recent", async (req, res, next) => {
  try {
    const requestedLimit = Number.parseInt(String(req.query.limit ?? "6"), 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 24) : 6;
    const swaps = await Swap.find({ status: "completed" })
      .sort({ completedAt: -1, createdAt: -1 })
      .limit(limit)
      .populate("requestedListing")
      .populate("offeredListing")
      .populate("requester", "username displayName rating swaps")
      .populate("owner", "username displayName rating swaps");

    res.json({
      items: swaps.map((swap) => ({
        id: String(swap._id),
        requestedListing: listingCard(swap.requestedListing),
        offeredListing: listingCard(swap.offeredListing),
        completedAt: swap.completedAt ?? null,
        createdAt: swap.createdAt,
        message: swap.message || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
