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
    seller: { name: l.seller?.name ?? "Swapt member", username: "", rating: l.seller?.rating ?? 0, swaps: l.seller?.swaps ?? 0 },
    postedDaysAgo: l.postedDaysAgo,
    tags: l.tags ?? [],
    views: l.views,
    saves: l.saves,
  };
}

function demoNewArrival(i: number): ApiListing {
  const listings = [...mockListings].sort(() => Math.random() - 0.5);
  const listing = listings[i % listings.length];
  let baseListing = toApiListing(listing);

  // Make it look like a new arrival (recently posted)
  baseListing = {
    ...baseListing,
    postedDaysAgo: Math.floor(Math.random() * 3), // 0-2 days ago
    // Slightly boost views to show they're getting attention
    views: baseListing.views + Math.floor(Math.random() * 50),
    saves: baseListing.saves + Math.floor(Math.random() * 20)
  };

  return baseListing;
}

export type NewArrival = ApiListing;

export type NewArrivalsResponse = { items: NewArrival[] };

export async function fetchNewArrivals(limit = 8): Promise<NewArrivalsResponse> {
  if (!apiEnabled) {
    const items = Array.from({ length: limit }, (_, i) => demoNewArrival(i + 1));
    return { items };
  }
  try {
    const data = await api<NewArrivalsResponse>(`/api/listings/new-arrivals?limit=${limit}`);
    return data;
  } catch {
    // Fallback to demo data on error
    const items = Array.from({ length: limit }, (_, i) => demoNewArrival(i + 1));
    return { items };
  }
}