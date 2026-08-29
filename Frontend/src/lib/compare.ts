import type { ApiListing } from "@/lib/listings-api";

/**
 * "Compare" tray — snapshots of listings the shopper chose to stack up.
 * Stored locally so the selection survives page changes (up to 4 items).
 */

const KEY = "swapt.compare";
export const COMPARE_MAX = 4;

export function readCompare(): ApiListing[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as ApiListing[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function addToCompare(listing: ApiListing): ApiListing[] {
  const next = [...readCompare().filter((l) => l.id !== listing.id), listing].slice(-COMPARE_MAX);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeFromCompare(id: string): ApiListing[] {
  const next = readCompare().filter((l) => l.id !== id);
  window.localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function isCompared(id: string): boolean {
  return readCompare().some((l) => l.id === id);
}

export function clearCompare(): void {
  window.localStorage.removeItem(KEY);
}