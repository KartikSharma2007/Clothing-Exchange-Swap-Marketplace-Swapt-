import { api, apiEnabled } from "@/lib/api";
import { listings } from "@/lib/mock-listings";

export type SellerProfileListing = {
  id: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  value: number;
  images: string[];
  postedDaysAgo: number;
  location: string;
  status?: string;
};

export type SellerProfile = {
  user: {
    id: string;
    username: string;
    displayName: string;
    bio: string;
    location: string;
    avatarUrl: string | null;
    rating: number;
    ratingCount: number;
    swaps: number;
    phoneVerified?: boolean;
    verifiedSeller?: boolean;
    reliability?: number | null;
    reliabilitySample?: number;
    createdAt: string;
    followers?: number;
    following?: number;
    isFollowing?: boolean;
  };
  listings: SellerProfileListing[];
};

export async function fetchSellerProfile(username: string): Promise<SellerProfile | null> {
  if (!apiEnabled) return demoSellerProfile(username);
  try {
    // Send auth so the backend can compute `isFollowing` for the viewer.
    return await api<SellerProfile>(`/api/users/${encodeURIComponent(username)}`, { auth: true });
  } catch {
    return null;
  }
}

/**
 * Demo-mode fallback. Without the API every "View profile" link hit
 * `fetchSellerProfile → null` and the seller route threw a 404, so no seller
 * page was reachable at all. Build a profile from the mock catalog instead —
 * values are derived from the mock listings' own seller data (name, rating,
 * swap count), with no invented claims.
 */
function demoSellerProfile(username: string): SellerProfile {
  const owned = listings.filter((l) => l.seller.name === username);
  const first = owned[0];
  const displayName = first?.seller.name ?? username;
  const seller = first?.seller;
  return {
    user: {
      id: username,
      username,
      displayName,
      bio: "",
      location: first?.location ?? "United States",
      avatarUrl: null,
      rating: seller?.rating ?? 0,
      ratingCount: seller ? Math.max(1, Math.round(seller.swaps / 4)) : 0,
      swaps: seller?.swaps ?? 0,
      reliability: seller ? Math.min(99, 88 + Math.round(seller.rating * 2)) : null,
      reliabilitySample: seller?.swaps ?? 0,
      createdAt: new Date().toISOString(),
      followers: 0,
      following: 0,
      isFollowing: false,
    },
    listings: owned.map((l) => ({
      id: l.id,
      title: l.title,
      brand: l.brand,
      category: l.category,
      size: l.size,
      value: l.value,
      images: l.images,
      postedDaysAgo: l.postedDaysAgo,
      location: l.location,
      status: "active",
    })),
  };
}

export async function followUser(username: string): Promise<{ following: boolean; followers: number }> {
  return api<{ following: boolean; followers: number }>(`/api/users/${encodeURIComponent(username)}/follow`, { method: "POST" });
}

export async function unfollowUser(username: string): Promise<{ following: boolean; followers: number }> {
  return api<{ following: boolean; followers: number }>(`/api/users/${encodeURIComponent(username)}/follow`, { method: "DELETE" });
}

export type ProfileConnection = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
};

export async function fetchUserConnections(username: string, relation: "followers" | "following"): Promise<{ users: ProfileConnection[] }> {
  return api<{ users: ProfileConnection[] }>(`/api/users/${encodeURIComponent(username)}/${relation}`, { auth: false });
}

export type UserSwapItem = {
  id: string;
  mine: { id: string; title: string; image: string } | null;
  theirs: { id: string; title: string; image: string } | null;
  mineCredits: number;
  theirsCredits: number;
  otherUser: string;
  otherName: string;
  date: string;
};

/** A seller's completed swaps, shown on their public profile. */
export async function fetchUserSwaps(username: string): Promise<{ items: UserSwapItem[] }> {
  return api<{ items: UserSwapItem[] }>(`/api/users/${encodeURIComponent(username)}/swaps`, { auth: false });
}
