import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings } from "@/lib/mock-listings";
import { readMyDeletedListings, readMyListingEdits } from "@/lib/listings-api";
import { demoMySwaps } from "@/lib/swap-api";

export type MyListing = {
  id: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  value: number;
  status: "active" | "hidden" | "swapped" | "draft" | "scheduled";
  publishAt?: string | null;
  moderationStatus?: "pending" | "approved" | "flagged" | "rejected";
  moderationReason?: string;
  returnWindowDays?: 0 | 7 | 14 | 30;
  returnPolicy?: string;
  featured: boolean;
  featuredUntil?: string | null;
  boostCount?: number;
  images: string[];
  createdAt: string;
  meetup?: boolean;
  lat?: number;
  lng?: number;
};

export type SwapRecord = {
  id: string;
  /** The shared chat thread between the two members this swap belongs to. */
  conversationId?: string | null;
  /** Id of the member at the other end of the swap (for live typing frames). */
  counterpartyId?: string | null;
  /** Pending requests auto-cancel after this ISO date (see expiry countdown). */
  expiresAt?: string | null;
  /** When the owner last sent a counter-offer on a pending swap. */
  counteredAt?: string | null;
  direction: "incoming" | "outgoing";
  status: "pending" | "accepted" | "declined" | "completed" | "cancelled";
  message: string;
  counterparty: { username: string; name: string; avatarUrl?: string | null };
  /** Messages from the counterparty this member hasn't read yet. */
  unreadCount: number;
  requestedListing: MyListing | null;
  requestedValue?: number | null;
  offeredListing: MyListing | null;
  offeredValue?: number | null;
  /** Bundle: 2-3 items offered for one (new). Falls back to single offeredListing for old swaps. */
  offeredListings?: MyListing[];
  offeredBundle?: MyListing[];
  createdAt: string;
  completedAt: string | null;
  /** Active dispute on this swap (if any), surfaced by the backend. */
  dispute: {
    id: string;
    reason: string;
    description: string;
    status: "open" | "resolved";
    resolutionNote?: string;
    outcome?: "none" | "refund_requester" | "release_owner";
  } | null;
  /** Credits escrowed against this swap (hold pending, release/refund settled). */
  escrow: { amount: number; status: "pending" | "completed" | "refunded"; receiptNo?: string } | null;
  /** Local meetup exchange instead of shipping. */
  meetup: boolean;
  meetupPlace: string;
  meetupTime: string | null;
  meetupLat?: number | null;
  meetupLng?: number | null;
  /** Shipping exchange (the alternative to meetup). */
  shipping: boolean;
  carrier: string;
  trackingNumber: string;
  shippingStatus: "awaiting_shipment" | "shipped" | "in_transit" | "delivered" | "exception" | null;
  labelUrl?: string;
  /** When the requester confirmed they received the item — required before
   *  either party can complete the swap. */
  receiptConfirmedAt?: string | null;
  shippingAddress?: { label: string; name: string; line1: string; line2: string; city: string; postal: string; country: string; phone: string } | null;
};

function mockCard(i: number, overrides: Partial<MyListing> = {}): MyListing {
  const l = mockListings[i % mockListings.length];
  return {
    id: l.id,
    title: l.title,
    brand: l.brand,
    category: l.category,
    size: l.size,
    value: l.value,
    status: "active",
    featured: false,
    images: l.images,
    createdAt: new Date(Date.now() - i * 86400000 * 3).toISOString(),
    ...overrides,
  };
}

export async function fetchMyListings(): Promise<MyListing[]> {
  if (!apiEnabled) {
    const deleted = new Set(readMyDeletedListings());
    const edits = readMyListingEdits();
    return [mockCard(0, { featured: true }), mockCard(1), mockCard(2, { status: "swapped" }), mockCard(3, { status: "hidden" })]
      .filter((l) => !deleted.has(l.id))
      .map((l) => ({ ...l, ...(edits[l.id] ?? {}) }));
  }
  const { items } = await api<{ items: MyListing[] }>("/api/me/listings");
  return items;
}

export async function fetchMySwaps(): Promise<SwapRecord[]> {
  if (!apiEnabled) {
    return demoMySwaps();
  }
  return fetchMySwapsPage().then((p) => p.items);
}

/** Cursor-paginated swap history (newest first). */
export async function fetchMySwapsPage(
  cursor?: string,
): Promise<{ items: SwapRecord[]; hasMore: boolean; nextCursor: string | null }> {
  if (!apiEnabled) {
    const all = await fetchMySwaps();
    return { items: all, hasMore: false, nextCursor: null };
  }
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<{ items: SwapRecord[]; hasMore: boolean; nextCursor: string | null }>(`/api/me/swaps${qs}`);
}

export type SellerAnalytics = {
  totalViews: number;
  totalSaves: number;
  active: number;
  swapped: number;
  hidden: number;
  totalListings: number;
  pendingSwaps: number;
  completedSwaps: number;
  totalSwaps: number;
  topListings: { id: string; title: string; views: number; saves: number; value: number; image: string | null }[];
};

export async function fetchSellerAnalytics(): Promise<SellerAnalytics> {
  if (!apiEnabled) {
    return {
      totalViews: 3420,
      totalSaves: 128,
      active: 4,
      swapped: 1,
      hidden: 1,
      totalListings: 6,
      pendingSwaps: 1,
      completedSwaps: 3,
      totalSwaps: 5,
      topListings: [
        { id: "1", title: "Beige cargo shorts", views: 1240, saves: 86, value: 22, image: mockListings[0].images[0] },
        { id: "8", title: "Washed denim trucker jacket", views: 3050, saves: 264, value: 55, image: mockListings[7].images[0] },
        { id: "3", title: "Burgundy silk halter", views: 2310, saves: 198, value: 45, image: mockListings[2].images[0] },
      ],
    };
  }
  return api<SellerAnalytics>("/api/me/analytics");
}

export type FollowingFeedItem = {
  id: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  value: number;
  images: string[];
  seller: { username: string; name: string; avatarUrl: string | null } | null;
  createdAt: string;
  views?: number;
  saves?: number;
};

export async function fetchFollowingFeed(): Promise<FollowingFeedItem[]> {
  if (!apiEnabled) return [];
  const { items } = await api<{ items: FollowingFeedItem[] }>("/api/me/following/feed");
  return items;
}

export async function fetchFollowingUsers(): Promise<{ username: string; displayName: string; avatarUrl: string | null }[]> {
  if (!apiEnabled) return [];
  const { users } = await api<{ users: { username: string; displayName: string; avatarUrl: string | null }[] }>("/api/me/following");
  return users;
}

export async function fetchFollowerUsers(): Promise<{ username: string; displayName: string; avatarUrl: string | null }[]> {
  if (!apiEnabled) return [];
  const { users } = await api<{ users: { username: string; displayName: string; avatarUrl: string | null }[] }>("/api/me/followers");
  return users;
}

export async function removeFollowingUser(username: string): Promise<void> {
  await api(`/api/users/${encodeURIComponent(username)}/follow`, { method: "DELETE" });
}

export async function removeFollowerUser(username: string): Promise<void> {
  await api(`/api/me/followers/${encodeURIComponent(username)}`, { method: "DELETE" });
}
