import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings, type Listing } from "@/lib/mock-listings";
import type { ApiListing } from "@/lib/listings-api";

function toApiListing(l: Listing): ApiListing {
  return {
    id: l.id,
    title: l.title,
    brand: l.brand,
    description: l.description ?? "",
    category: l.category,
    gender: l.gender,
    size: l.size,
    condition: l.condition,
    color: l.color,
    value: l.value,
    location: l.location,
    images: l.images,
    seller: {
      name: l.seller?.name ?? "Swapt member",
      username: l.seller?.username ?? "",
      rating: l.seller?.rating ?? 0,
      swaps: l.seller?.swaps ?? 0
    },
    postedDaysAgo: l.postedDaysAgo,
    tags: l.tags ?? [],
    views: l.views,
    saves: l.saves,
  };
}

function demoSeller(i: number) {
  const listings = [...mockListings].sort(() => Math.random() - 0.5).slice(0, 3);
  return {
    id: `seller-${i}`,
    name: [`Alex Morgan`, "Taylor Johnson", "Casey Williams", "Riley Davis", "Jordan Lee"][i % 5],
    username: [`alex_m`, "taylor_j", "casey_w", "riley_d", "jordan_l"][i % 5],
    avatarUrl: [`/avatars/1.jpg`, "/avatars/2.jpg", "/avatars/3.jpg", "/avatars/4.jpg", "/avatars/5.jpg"][i % 5],
    rating: 4.0 + (Math.random() * 1.0), // 4.0-5.0 rating
    swaps: Math.floor(Math.random() * 50) + 10, // 10-59 swaps
    listings: listings.map(toApiListing)
  };
}

export type SellerProfile = {
  id: string;
  name: string;
  username: string;
  avatarUrl: string | null;
  rating: number;
  swaps: number;
  listings: ApiListing[];
};

export type FeaturedSellersResponse = { items: SellerProfile[] };

export async function fetchFeaturedSellers(limit = 4): Promise<FeaturedSellersResponse> {
  if (!apiEnabled) {
    const items = Array.from({ length: limit }, (_, i) => demoSeller(i + 1));
    return { items };
  }
  try {
    const data = await api<FeaturedSellersResponse>(`/api/sellers/featured?limit=${limit}`);
    return data;
  } catch {
    // Fallback to demo data on error
    const items = Array.from({ length: limit }, (_, i) => demoSeller(i + 1));
    return { items };
  }
}