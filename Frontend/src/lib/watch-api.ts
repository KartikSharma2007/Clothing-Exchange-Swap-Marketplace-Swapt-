import { api, apiEnabled } from "@/lib/api";

export type WatchItem = {
  id: string;
  listing: { id: string; title: string; brand: string; value: number; status: string; image: string | null };
  lastValue: number;
  createdAt: string;
};

export async function fetchWatches(): Promise<WatchItem[]> {
  if (!apiEnabled) return [];
  const { items } = await api<{ items: WatchItem[] }>("/api/me/watches");
  return items;
}

export async function checkWatch(listingId: string): Promise<boolean> {
  if (!apiEnabled) return false;
  try {
    const { watching } = await api<{ watching: boolean }>(`/api/listings/${listingId}/watch`);
    return watching;
  } catch {
    return false;
  }
}

export async function fetchWatch(listingId: string): Promise<{ watching: boolean; watch: { id: string; lastValue: number; notifyPriceDrop: boolean; notifyRestock: boolean } | null } | null> {
  if (!apiEnabled) return null;
  try {
    return await api(`/api/listings/${listingId}/watch`);
  } catch {
    return null;
  }
}

export async function watchListing(listingId: string): Promise<void> {
  await api(`/api/listings/${listingId}/watch`, { method: "POST" });
}

export async function unwatchListing(listingId: string): Promise<void> {
  await api(`/api/listings/${listingId}/watch`, { method: "DELETE" });
}

export async function updateWatchPrefs(listingId: string, prefs: { notifyPriceDrop?: boolean; notifyRestock?: boolean }): Promise<void> {
  await api(`/api/listings/${listingId}/watch`, { method: "PATCH", body: prefs });
}
