import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings } from "@/lib/mock-listings";

/** A suggested mutual swap: you own `yourListing`, the counterparty owns
 *  `theirListing`, and you each want what the other has. */
export type SwapMatch = {
  id: string;
  counterparty: { id: string; username: string; name: string; avatarUrl?: string | null };
  yourListing: { id: string; title: string; brand: string; size: string; value: number; image: string };
  theirListing: { id: string; title: string; brand: string; size: string; value: number; image: string };
  /** Interest signals that make this mutual: "saved" | "swap_request" | "saved_search". */
  signals: { youWant: string[]; theyWant: string[] };
  score: number;
};

function mockListing(i: number) {
  const l = mockListings[i % mockListings.length];
  return { id: l.id, title: l.title, brand: l.brand, size: l.size, value: l.value, image: l.images[0] };
}

function mockMatches(): SwapMatch[] {
  return [
    {
      id: "m1",
      counterparty: { id: "u_mira", username: "mira.k", name: "Mira K.", avatarUrl: null },
      yourListing: mockListing(0),
      theirListing: mockListing(4),
      signals: { youWant: ["saved"], theyWant: ["saved"] },
      score: 4,
    },
    {
      id: "m2",
      counterparty: { id: "u_jonas", username: "jonas", name: "Jonas P.", avatarUrl: null },
      yourListing: mockListing(2),
      theirListing: mockListing(1),
      signals: { youWant: ["saved_search"], theyWant: ["swap_request"] },
      score: 4,
    },
  ];
}

/** Suggested mutual swaps for the signed-in member (never auto-created). */
export async function fetchSwapMatches(): Promise<SwapMatch[]> {
  if (!apiEnabled) return mockMatches();
  const data = await api<{ matches: SwapMatch[] }>("/api/me/swap-matches");
  return data.matches;
}
