import { api, apiEnabled } from "@/lib/api";
import { type Listing } from "@/lib/mock-listings";
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
    seller: { name: l.seller?.name ?? "Swapt member", username: "", rating: l.seller?.rating ?? 0, swaps: l.seller?.swaps ?? 0 },
    postedDaysAgo: l.postedDaysAgo,
    tags: l.tags ?? [],
    views: l.views,
    saves: l.saves,
  };
}

function demoRecentSwap(i: number): RecentSwap {
  const listings = [...mockListings].sort(() => Math.random() - 0.5);
  const [listing1, listing2] = listings.slice(0, 2);

  return {
    id: `swap-${i}`,
    requestedListing: toApiListing(listing1),
    offeredListing: toApiListing(listing2),
    completedAt: new Date(Date.now() - i * 86400000 * Math.random() * 3).toISOString(), // Last 3 days
    message: [
      "Great swap! Both items were exactly as described.",
      "Happy with this exchange - perfect fit and quality.",
      "Thanks for the smooth transaction!",
      "Loving my new-to-me item!",
      "Easy swap, great communication.",
      "Both items arrived quickly and were as described."
    ][Math.floor(Math.random() * 6)]
  };
}

function demoRecentSwaps(count: number): RecentSwap[] {
  return Array.from({ length: count }, (_, i) => demoRecentSwap(i + 1));
}

export type RecentSwap = {
  id: string;
  requestedListing: ApiListing | null;
  offeredListing: ApiListing | null;
  completedAt: string | null;
  message: string | null;
};

export type RecentSwapsResponse = { items: RecentSwap[] };

export async function fetchRecentSwaps(limit = 6): Promise<RecentSwapsResponse> {
  if (!apiEnabled) {
    const items = demoRecentSwaps(limit);
    return { items };
  }
  try {
    const data = await api<RecentSwapsResponse>(`/api/swaps/recent?limit=${limit}`);
    return data;
  } catch {
    // Fallback to demo data on error
    const items = demoRecentSwaps(limit);
    return { items };
  }
}