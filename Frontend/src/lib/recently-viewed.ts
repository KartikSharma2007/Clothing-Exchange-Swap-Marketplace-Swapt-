import type { ApiListing } from "@/lib/listings-api";

/**
 * Recently-viewed trail — the last handful of listing pages you opened,
 * shown as a "Recently viewed" row on the home page.
 */

const KEY = "swapt.recently-viewed";
const MAX = 12;

export function readRecentlyViewed(): ApiListing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ApiListing[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function recordRecentlyViewed(listing: ApiListing): ApiListing[] {
  const next = [listing, ...readRecentlyViewed().filter((l) => l.id !== listing.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
  return next;
}