/**
 * Demo-mode "out of stock" tracker. When a swap completes in local mode the
 * exchanged listings are recorded here so browse/listings can show them as
 * swapped instead of requestable. In API mode the backend owns stock (the
 * listing's `status`/`quantity`), so this module is only used when
 * `!apiEnabled`.
 */
const SOLD_KEY = "swapt.soldListings";

export function demoSoldIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(SOLD_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

export function isDemoSold(id: string | null | undefined): boolean {
  if (!id) return false;
  return demoSoldIds().includes(id);
}

/** Record consumed listings after a completed swap. */
export function markDemoSold(ids: Array<string | null | undefined>): void {
  const next = [...new Set([...demoSoldIds(), ...ids.filter(Boolean) as string[]])];
  window.localStorage.setItem(SOLD_KEY, JSON.stringify(next));
}