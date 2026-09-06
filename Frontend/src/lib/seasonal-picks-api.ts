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

// Define seasonal categories based on current month
function getSeasonalCategories(): string[] {
  const month = new Date().getMonth(); // 0-11 (Jan-Dec)

  // Winter: Dec, Jan, Feb (11, 0, 1)
  // Spring: Mar, Apr, May (2, 3, 4)
  // Summer: Jun, Jul, Aug (5, 6, 7)
  // Fall: Sep, Oct, Nov (8, 9, 10)

  if (month === 11 || month <= 1) { // Winter
    return ["Coats & Jackets", "Sweaters", "Boots", "Scarves"];
  } else if (month >= 2 && month <= 4) { // Spring
    return ["Dresses", "Light Jackets", "T-Shirts", "Sneakers"];
  } else if (month >= 5 && month <= 7) { // Summer
    return ["Shorts", "Tank Tops", "Sundresses", "Sandals"];
  } else { // Fall
    return ["Jeans", "Long Sleeve Tops", "Light Jackets", "Boots"];
  }
}

function demoSeasonalPick(i: number): ApiListing {
  const listings = [...mockListings].sort(() => Math.random() - 0.5);
  const listing = listings[i % listings.length];
  const baseListing = toApiListing(listing);

  // Modify to make it look seasonal
  const seasonalCategories = getSeasonalCategories();
  const seasonalCategory = seasonalCategories[i % seasonalCategories.length];

  return {
    ...baseListing,
    category: seasonalCategory.toLowerCase().replace(/\s+/g, '-'), // Convert to kebab-case
    // Add some seasonal variation to title
    title: `${[
      "Cozy Winter", "Spring Fresh", "Summer Vibes", "Fall Cozy"
    ][Math.floor(Math.random() * 4)]} ${baseListing.title}`,
    // Boost views/saves to make them look popular
    views: baseListing.views + Math.floor(Math.random() * 1000),
    saves: baseListing.saves + Math.floor(Math.random() * 100)
  };
}

export type SeasonalPick = ApiListing;

export type SeasonalPicksResponse = { items: SeasonalPick[] };

export async function fetchSeasonalPicks(limit = 6): Promise<SeasonalPicksResponse> {
  if (!apiEnabled) {
    const items = Array.from({ length: limit }, (_, i) => demoSeasonalPick(i + 1));
    return { items };
  }
  try {
    const data = await api<SeasonalPicksResponse>(`/api/listings/seasonal?limit=${limit}`);
    return data;
  } catch {
    // Fallback to demo data on error
    const items = Array.from({ length: limit }, (_, i) => demoSeasonalPick(i + 1));
    return { items };
  }
}