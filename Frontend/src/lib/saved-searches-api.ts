import { api, apiEnabled } from "@/lib/api";

export type SavedSearch = {
  id: string;
  name: string;
  q: string;
  cat: string;
  size: string;
  condition: string;
  g: string;
  brand: string;
  tag: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  meetupOnly: boolean;
  alertsEnabled: boolean;
  lastAlertAt: string | null;
  createdAt: string;
};

export type SavedSearchInput = Partial<Omit<SavedSearch, "id" | "lastAlertAt" | "createdAt">>;

export async function fetchSavedSearches(): Promise<{ items: SavedSearch[] }> {
  if (!apiEnabled) return { items: [] };
  return api("/api/me/saved-searches");
}

export async function createSavedSearch(input: SavedSearchInput): Promise<{ search: SavedSearch }> {
  return api("/api/me/saved-searches", { method: "POST", body: input });
}

export async function updateSavedSearch(id: string, input: SavedSearchInput): Promise<{ search: SavedSearch }> {
  return api(`/api/me/saved-searches/${id}`, { method: "PATCH", body: input });
}

export async function deleteSavedSearch(id: string): Promise<{ ok: boolean }> {
  return api(`/api/me/saved-searches/${id}`, { method: "DELETE" });
}
