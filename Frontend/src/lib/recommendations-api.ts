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

function demoItems(count: number): ApiListing[] {
  const sorted = [...mockListings].sort((a, b) => (b.views ?? 0) + (b.saves ?? 0) * 3 - ((a.views ?? 0) + (a.saves ?? 0) * 3));
  return sorted.slice(0, count).map(toApiListing);
}

export type RecommendationsResponse = { items: ApiListing[] };

export async function fetchRecommended(limit = 8): Promise<ApiListing[]> {
  if (!apiEnabled) return demoItems(limit);
  try {
    const data = await api<RecommendationsResponse>(`/api/recommendations/for-you?limit=${limit}`);
    return data.items;
  } catch {
    return demoItems(limit);
  }
}

export async function fetchPopular(limit = 8): Promise<ApiListing[]> {
  if (!apiEnabled) return demoItems(limit);
  try {
    const data = await api<RecommendationsResponse>(`/api/recommendations/popular?limit=${limit}`);
    return data.items;
  } catch {
    return demoItems(limit);
  }
}