import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings, type Listing } from "@/lib/mock-listings";
import { demoSoldIds, isDemoSold } from "@/lib/sold";

/** Count a listing view. The client calls this once per browser session. */
export async function recordView(listingId: string): Promise<void> {
  if (!apiEnabled) return;
  try {
    await api<{ views: number }>(`/api/listings/${listingId}/view`, { method: "POST", auth: false });
  } catch {
    /* views are best-effort */
  }
}

export type FitDetail = {
  dimension: string;
  body: number;
  garment: number;
  ok: boolean;
  note: string;
};

export type FitInfo = {
  likelyFit: boolean;
  confidence: "high" | "medium" | "low" | null;
  matches: FitDetail[];
};

export type ApiListing = {
  id: string;
  title: string;
  brand: string;
  description: string;
  category: Listing["category"];
  gender: Listing["gender"];
  size: Listing["size"];
  condition: Listing["condition"];
  color: string;
  value: number;
  retailValue?: number;
  location: string;
  images: string[];
  /** PublicIds mirroring `images` 1:1 — lets the owner reorder / pick the cover. */
  imageIds?: string[];
  seller: { name: string; username: string; rating: number; swaps: number; reliability?: number | null; reliabilitySample?: number; avatarUrl?: string | null; joined?: string; responseTime?: string };
  postedDaysAgo: number;
  material?: string;
  fit?: string;
  style?: string;
  pattern?: string;
  season?: string;
  care?: string;
  measurements?: Listing["measurements"];
  tags?: string[];
  quantity?: number;
  shipsFrom?: string;
  shippingDays?: string;
  swapPreferences?: string;
  views?: number;
  saves?: number;
  /** Seller is open to a local meetup instead of shipping. */
  meetup?: boolean;
  lat?: number;
  lng?: number;
  /** Distance to the viewer's location (km) when browsing by distance. */
  distanceKm?: number;
  /** "Likely fits you" — computed from the signed-in viewer's saved measurements. */
  likelyFit?: boolean;
  fitDetails?: FitInfo | null;
  /** Why this item was recommended next to the listing being viewed. */
  matchLabel?: string;
  /** Availability — swapped/hidden items are "out of stock" in the UI. Draft/scheduled hidden from browse. */
  status?: "active" | "swapped" | "hidden" | "draft" | "scheduled";
  publishAt?: string | null;
  featured?: boolean;
  featuredUntil?: string | null;
  boostCount?: number;
  moderationStatus?: "pending" | "approved" | "flagged" | "rejected";
  moderationReason?: string;
  moderationScore?: number;
  returnWindowDays?: 0 | 7 | 14 | 30;
  returnPolicy?: string;
};

export type BrowseQuery = {
  q: string; cat: string; size: string; condition?: string; sort: string;
  /** Gender department: Womens | Mens | Unisex | Kids */
  g?: string;
  /** Exact brand name */
  brand?: string;
  /** Curated collection: "sports" | "trending" | "sale" */
  tag?: string;
  /** Location filter: centre point + radius. */
  lat?: number;
  lng?: number;
  radiusKm?: number;
  /** Only items the seller is willing to hand over locally. */
  meetupOnly?: boolean;
  /** Credit-range filter — the swap value the seller wants in return. */
  minValue?: number;
  maxValue?: number;
  /** 1-based page index. */
  page?: number;
  /** Items per page. */
  limit?: number;
};

/** What the browse endpoint returns for one page of results. */
export type BrowseResult = {
  items: ApiListing[];
  total: number;
  page: number;
  pages: number;
};

/** Brands surfaced under the Sports nav section. */
export const SPORTS_BRANDS = [
  "Nike", "Adidas", "Patagonia", "The North Face", "Puma",
  "Under Armour", "Vans", "New Balance", "Reebok", "Champion",
];

function filterMock({ q, cat, size, condition, sort, g, brand, tag, minValue, maxValue }: BrowseQuery): ApiListing[] {
  const query = q.trim().toLowerCase();
  const sold = new Set(demoSoldIds());
  let out = mockListings.filter((l) => {
    if (sold.has(l.id)) return false;
    if (query && !`${l.title} ${l.brand} ${l.color}`.toLowerCase().includes(query)) return false;
    if (cat && l.category !== cat) return false;
    if (size && l.size !== size) return false;
    if (condition && l.condition !== condition) return false;
    if (g && l.gender !== g && !(g !== "Kids" && l.gender === "Unisex")) return false;
    if (brand && l.brand.toLowerCase() !== brand.toLowerCase()) return false;
    if (minValue != null && l.value < minValue) return false;
    if (maxValue != null && l.value > maxValue) return false;
    if (tag === "sports" && !SPORTS_BRANDS.some((b) => b.toLowerCase() === l.brand.toLowerCase())) return false;
    if (tag === "trending" && l.postedDaysAgo > 7) return false;
    if (tag === "sale" && l.value > 25) return false;
    return true;
  });
  if (sort === "relevance" && query) {
    // Weighted score: title > brand > colour > description/tags, plus popularity.
    const score = (l: (typeof mockListings)[number]) => {
      const hay = `${l.title} ${l.brand} ${l.color}`.toLowerCase();
      const hayLong = `${l.title} ${l.brand} ${l.color} ${(l.tags ?? []).join(" ")}`.toLowerCase();
      let s = 0;
      if (hay.includes(query)) s += 10;
      if (l.title.toLowerCase().includes(query)) s += 6;
      if (l.brand.toLowerCase().includes(query)) s += 4;
      if (hayLong.includes(query)) s += 2;
      s += Math.min(3, ((l.views ?? 0) + (l.saves ?? 0) * 3) / 300);
      return s;
    };
    out = [...out].sort((a, b) => score(b) - score(a));
  } else {
    switch (sort) {
      case "value-asc": out = [...out].sort((a, b) => a.value - b.value); break;
      case "value-desc": out = [...out].sort((a, b) => b.value - a.value); break;
      case "oldest": out = [...out].sort((a, b) => b.postedDaysAgo - a.postedDaysAgo); break;
      case "most-saved": out = [...out].sort((a, b) => (b.saves ?? 0) - (a.saves ?? 0)); break;
      case "most-viewed": out = [...out].sort((a, b) => (b.views ?? 0) - (a.views ?? 0)); break;
      case "top-rated": out = [...out].sort((a, b) => (b.seller?.rating ?? 0) - (a.seller?.rating ?? 0)); break;
      default: out = [...out].sort((a, b) => a.postedDaysAgo - b.postedDaysAgo);
    }
  }
  return out as ApiListing[];
}

export async function fetchListings(params: BrowseQuery): Promise<BrowseResult> {
  if (!apiEnabled) {
    const items = filterMock(params);
    return { items, total: items.length, page: 1, pages: 1 };
  }
  const search = new URLSearchParams({
    q: params.q, cat: params.cat, size: params.size, condition: params.condition ?? "", sort: params.sort,
    g: params.g ?? "", brand: params.brand ?? "", tag: params.tag ?? "",
    page: String(params.page ?? 1), limit: String(params.limit ?? 24),
  });
  if (params.lat !== undefined) search.set("lat", String(params.lat));
  if (params.lng !== undefined) search.set("lng", String(params.lng));
  if (params.radiusKm !== undefined) search.set("radiusKm", String(params.radiusKm));
  if (params.meetupOnly) search.set("meetupOnly", "true");
  if (params.minValue !== undefined) search.set("minValue", String(params.minValue));
  if (params.maxValue !== undefined) search.set("maxValue", String(params.maxValue));
  // Send the access token if present so the server can annotate "likely fit"
  // items from the signed-in member's measurements.
  return api<BrowseResult>(`/api/listings?${search}`);
}

export type Facets = {
  categories: { value: string; count: number }[];
  sizes: { value: string; count: number }[];
  brands: { value: string; count: number }[];
};

/** Facet counts (categories, sizes, brands) for the browse filters. */
export async function fetchFacets(): Promise<Facets> {
  if (!apiEnabled) {
    const brands = Array.from(new Set(mockListings.map((l) => l.brand))).sort();
    return {
      categories: [],
      sizes: [],
      brands: brands.map((value) => ({ value, count: mockListings.filter((l) => l.brand === value).length })),
    };
  }
  try {
    return await api<Facets>("/api/listings/facets", { auth: false });
  } catch {
    return { categories: [], sizes: [], brands: [] };
  }
}

export async function fetchListing(id: string): Promise<{ listing: ApiListing; related: ApiListing[] } | null> {
  if (!apiEnabled) {
    const listing = mockListings.find((l) => l.id === id) as ApiListing | undefined;
    if (!listing) return null;
    const unavailable = isDemoSold(id);
    const related = mockListings
      .filter((l) => l.id !== id && l.category === listing.category && !isDemoSold(l.id))
      .slice(0, 4)
      .map((l) => ({
        ...(l as ApiListing),
        matchLabel: l.brand === listing.brand ? "Same brand" : "Same category",
      }));
    return { listing: { ...listing, status: unavailable ? "swapped" : "active" }, related };
  }
  try {
    return await api<{ listing: ApiListing; related: ApiListing[] }>(`/api/listings/${id}`);
  } catch {
    return null;
  }
}

export type NewListingInput = {
  title: string; brand: string; description: string; category: string; gender: string;
  size: string; condition: string; color: string; value: number; location?: string;
  meetup?: boolean; lat?: number; lng?: number;
  material?: string; fit?: string; style?: string; pattern?: string; season?: string;
  care?: string; tags?: string; quantity?: number; shippingDays?: string;
  swapPreferences?: string; retailValue?: number;
  chest?: string; waist?: string; hips?: string; length?: string; inseam?: string;
  shoulder?: string; sleeve?: string;
  status?: "active" | "draft" | "scheduled";
  publishAt?: string;
  returnWindowDays?: 0 | 7 | 14 | 30;
  returnPolicy?: string;
  images: File[];
};

/** Multipart upload — Multer on the server streams each file to Cloudinary. */
export async function createListing(input: NewListingInput) {
  const form = new FormData();
  Object.entries(input).forEach(([key, value]) => {
    if (key === "images") return;
    if (value !== undefined && value !== null) form.append(key, String(value));
  });
  input.images.forEach((file) => form.append("images", file));
  return api<{ listing: ApiListing; moderation?: { status: string; reason: string } }>("/api/listings", { method: "POST", body: form });
}

/** Editable listing fields (mirrors the backend PATCH /api/listings/:id body). */
export type UpdateListingInput = Partial<
  Pick<NewListingInput, "title" | "brand" | "description" | "category" | "gender" | "size" | "condition" | "color" | "value" | "location" | "meetup" | "retailValue" | "material" | "fit" | "style" | "pattern" | "season" | "care" | "shippingDays" | "swapPreferences" | "quantity" | "tags" | "returnWindowDays" | "returnPolicy">
> & {
  /** Ordered image identifiers (publicIds in prod, image URLs in demo mode). */
  imageOrder?: string[];
  /** Identifiers of existing photos to delete. */
  removeImages?: string[];
  /** New photos to upload (sent as multipart). */
  newImages?: File[];
  lat?: number;
  lng?: number;
};

// Demo-mode overrides so edit/delete behave offline too. The real backend is
// the source of truth when VITE_API_URL is set.
const MY_EDIT_KEY = "swapt.my-listing-edits";
const MY_DELETED_KEY = "swapt.my-listing-deleted";

export function readMyListingEdits(): Record<string, Partial<ApiListing>> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(MY_EDIT_KEY) ?? "{}") as Record<string, Partial<ApiListing>>;
  } catch {
    return {};
  }
}

export function readMyDeletedListings(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(MY_DELETED_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** PATCH /api/listings/:id — owner only. JSON normally; multipart when adding
 *  new photos so the files ride along with the field updates. */
export async function updateListing(id: string, patch: UpdateListingInput): Promise<{ listing: ApiListing }> {
  if (!apiEnabled) {
    const edits = readMyListingEdits();
    const base = mockListings.find((l) => l.id === id) as ApiListing | undefined;
    const currentImages = edits[id]?.images ?? base?.images ?? [];
    const merged = { ...(edits[id] ?? {}), ...patch } as Partial<ApiListing>;
    if (patch.removeImages?.length) {
      merged.images = currentImages.filter((u) => !patch.removeImages!.includes(u));
    }
    if (patch.newImages?.length) {
      merged.images = [...(merged.images ?? []), ...patch.newImages.map((f) => URL.createObjectURL(f))];
    }
    if (patch.imageOrder !== undefined && (merged.images?.length ?? 0) > 0) {
      // In demo mode imageOrder is the ordered `images` URLs — reorder the array.
      const rank = new Map(patch.imageOrder.map((url, i) => [url, i]));
      merged.images = [...(merged.images ?? [])].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
    }
    delete (merged as { imageOrder?: unknown }).imageOrder;
    delete (merged as { removeImages?: unknown }).removeImages;
    delete (merged as { newImages?: unknown }).newImages;
    edits[id] = merged;
    window.localStorage.setItem(MY_EDIT_KEY, JSON.stringify(edits));
    return { listing: { ...(base ?? ({ id } as ApiListing)), ...merged } };
  }

  // New photos → multipart so the files reach multer on the backend.
  if (patch.newImages?.length) {
    const form = new FormData();
    Object.entries(patch).forEach(([key, value]) => {
      if (key === "newImages") return;
      if (value === undefined || value === null) return;
      if (Array.isArray(value)) value.forEach((item) => form.append(key, item));
      else form.append(key, String(value));
    });
    patch.newImages.forEach((file) => form.append("images", file));
    return api<{ listing: ApiListing }>(`/api/listings/${id}`, { method: "PATCH", body: form });
  }
  return api<{ listing: ApiListing }>(`/api/listings/${id}`, { method: "PATCH", body: patch });
}

/** PATCH /api/listings/:id/visibility — owner unpublishes/re-publishes (no delete). */
export async function setListingVisibility(id: string, visible: boolean): Promise<{ listing: ApiListing }> {
  if (!apiEnabled) {
    const edits = readMyListingEdits();
    const base = mockListings.find((l) => l.id === id) as ApiListing | undefined;
    edits[id] = { ...(edits[id] ?? {}), status: visible ? "active" : "hidden" } as Partial<ApiListing>;
    window.localStorage.setItem(MY_EDIT_KEY, JSON.stringify(edits));
    return { listing: { ...(base ?? ({ id } as ApiListing)), ...edits[id] } };
  }
  return api<{ listing: ApiListing }>(`/api/listings/${id}/visibility`, { method: "PATCH", body: { visible } });
}

/** DELETE /api/listings/:id — owner only; also removes the Cloudinary photos. */
export async function deleteListing(id: string): Promise<{ ok: boolean }> {
  if (!apiEnabled) {
    const deleted = readMyDeletedListings();
    if (!deleted.includes(id)) deleted.push(id);
    window.localStorage.setItem(MY_DELETED_KEY, JSON.stringify(deleted));
    const edits = readMyListingEdits();
    delete edits[id];
    window.localStorage.setItem(MY_EDIT_KEY, JSON.stringify(edits));
    return { ok: true };
  }
  return api<{ ok: boolean }>(`/api/listings/${id}`, { method: "DELETE" });
}

/** POST /api/listings/:id/boost — pay credits to feature for 7 days */
export async function boostListing(id: string): Promise<{ featuredUntil: string; cost: number }> {
  if (!apiEnabled) {
    const edits = readMyListingEdits();
    edits[id] = { ...(edits[id] ?? {}), featured: true } as any;
    window.localStorage.setItem(MY_EDIT_KEY, JSON.stringify(edits));
    return { featuredUntil: new Date(Date.now() + 7 * 86400000).toISOString(), cost: 30 };
  }
  return api<{ featuredUntil: string; cost: number }>(`/api/listings/${id}/boost`, { method: "POST" });
}

/** POST /api/listings/:id/publish — publish a draft/scheduled listing */
export async function publishListing(id: string): Promise<{ listing: ApiListing; moderation?: { status: string; reason: string } }> {
  if (!apiEnabled) {
    const edits = readMyListingEdits();
    edits[id] = { ...(edits[id] ?? {}), status: "active" } as any;
    window.localStorage.setItem(MY_EDIT_KEY, JSON.stringify(edits));
    return { listing: edits[id] as ApiListing };
  }
  return api(`/api/listings/${id}/publish`, { method: "POST" });
}

/** POST /api/listings/:id/schedule — schedule a draft for future publish */
export async function scheduleListing(id: string, publishAt: string): Promise<{ listing: ApiListing }> {
  if (!apiEnabled) {
    const edits = readMyListingEdits();
    edits[id] = { ...(edits[id] ?? {}), status: "scheduled", publishAt } as any;
    window.localStorage.setItem(MY_EDIT_KEY, JSON.stringify(edits));
    return { listing: edits[id] as ApiListing };
  }
  return api(`/api/listings/${id}/schedule`, { method: "POST", body: { publishAt } });
}

export type ImportResult = {
  imported: number;
  failed: number;
  errors: { row: number; reason: string }[];
};

/**
 * Bulk-create listings from an uploaded .csv file. Columns mirror the CSV
 * export; image1..image3 are public image URLs fetched server-side.
 */
export async function importListingsCsv(file: File): Promise<ImportResult> {
  if (!apiEnabled) {
    const text = await file.text();
    const dataRows = text.split(/\r?\n/).filter((l) => l.trim() !== "").length - 1;
    return { imported: Math.max(0, dataRows), failed: 0, errors: [] };
  }
  const form = new FormData();
  form.append("file", file);
  return api<ImportResult>("/api/me/listings/import", { method: "POST", body: form });
}

/** Fields the AI vision model returns for a listing photo. */
export type AiSuggestion = {
  title: string;
  brand: string;
  color: string;
  category: string;
  condition: string;
  size: string;
  confidence: number;
  source: "ai";
};

/**
 * Downscale an image to a JPEG ≤ `max` px so AI providers accept it (some
 * reject AVIF/WebP and large payloads) and the upload stays small.
 */
export async function fileToJpeg(file: File, max = 1280): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Couldn't read that image."));
      img.src = url;
    });
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas isn't supported in this browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Couldn't process the image.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Ask the server's vision model to fill listing fields from a photo. */
export async function suggestListingFromImage(file: File): Promise<{ suggestion: AiSuggestion }> {
  const form = new FormData();
  form.append("image", file);
  return api<{ suggestion: AiSuggestion }>("/api/listings/ai-suggest", { method: "POST", body: form });
}
