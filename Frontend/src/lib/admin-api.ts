import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings } from "@/lib/mock-listings";
import { CATEGORIES } from "@/lib/taxonomy";

export type AdminListing = {
  id: string;
  title: string;
  brand: string;
  category: string;
  size: string;
  condition: string;
  value: number;
  status: "active" | "hidden" | "swapped";
  featured: boolean;
  images: string[];
  seller: { id: string; username: string; name: string };
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  targetType: "listing" | "user";
  targetId: string;
  targetLabel: string;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type AdminQuery = { q: string; status: "all" | "active" | "hidden" | "swapped" | "featured"; page?: number };

// ---- demo (no VITE_API_URL) -------------------------------------------------
const demoListings: AdminListing[] = mockListings.slice(0, 12).map((l, i) => ({
  id: l.id,
  title: l.title,
  brand: l.brand,
  category: l.category,
  size: l.size,
  condition: l.condition,
  value: l.value,
  status: i % 7 === 3 ? "hidden" : i % 5 === 4 ? "swapped" : "active",
  featured: i % 6 === 0,
  images: l.images,
  seller: { id: `u${i}`, username: l.seller.name.toLowerCase().replace(/[^a-z]/g, "") || "member", name: l.seller.name },
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
}));

let demoAudit: AuditEntry[] = [
  {
    id: "a1", actor: "moderator", action: "listing.hide", targetType: "listing", targetId: demoListings[3]?.id ?? "x",
    targetLabel: demoListings[3]?.title ?? "Listing", reason: "Counterfeit branding reported",
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "a2", actor: "moderator", action: "listing.feature", targetType: "listing", targetId: demoListings[0]?.id ?? "y",
    targetLabel: demoListings[0]?.title ?? "Listing", reason: "Great photography",
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

function demoLog(entry: Omit<AuditEntry, "id" | "actor" | "createdAt">) {
  demoAudit = [
    { id: crypto.randomUUID(), actor: "you", createdAt: new Date().toISOString(), ...entry },
    ...demoAudit,
  ];
}

// ---- API --------------------------------------------------------------------
export async function fetchAdminListings(params: AdminQuery): Promise<{ items: AdminListing[]; total: number; limit: number; pages: number; page: number }> {
  if (!apiEnabled) {
    const q = params.q.trim().toLowerCase();
    const filtered = demoListings.filter((l) => {
      if (q && !`${l.title} ${l.brand} ${l.seller.username}`.toLowerCase().includes(q)) return false;
      if (params.status === "featured") return l.featured;
      if (params.status !== "all") return l.status === params.status;
      return true;
    });
    const limit = 48;
    const page = params.page ?? 1;
    const start = (page - 1) * limit;
    return { items: filtered.slice(start, start + limit), total: filtered.length, limit, pages: Math.ceil(filtered.length / limit) || 1, page };
  }
  const search = new URLSearchParams({ q: params.q, status: params.status, limit: "48", page: String(params.page ?? 1) });
  return api<{ items: AdminListing[]; total: number; limit: number; pages: number; page: number }>(`/api/admin/listings?${search}`);
}

export async function toggleFeature(listing: AdminListing, reason: string) {
  const featured = !listing.featured;
  if (!apiEnabled) {
    const target = demoListings.find((l) => l.id === listing.id);
    if (target) target.featured = featured;
    demoLog({
      action: featured ? "listing.feature" : "listing.unfeature",
      targetType: "listing", targetId: listing.id, targetLabel: listing.title, reason,
    });
    return;
  }
  await api(`/api/admin/listings/${listing.id}/feature`, { method: "PATCH", body: { featured, reason } });
}

export async function setListingStatus(listing: AdminListing, status: "active" | "hidden", reason: string) {
  if (!apiEnabled) {
    const target = demoListings.find((l) => l.id === listing.id);
    if (target) {
      target.status = status;
      if (status === "hidden") target.featured = false;
    }
    demoLog({
      action: status === "hidden" ? "listing.hide" : "listing.restore",
      targetType: "listing", targetId: listing.id, targetLabel: listing.title, reason,
    });
    return;
  }
  await api(`/api/admin/listings/${listing.id}/status`, { method: "PATCH", body: { status, reason } });
}

export async function removeListing(listing: AdminListing, reason: string) {
  if (!apiEnabled) {
    const idx = demoListings.findIndex((l) => l.id === listing.id);
    if (idx >= 0) demoListings.splice(idx, 1);
    demoLog({ action: "listing.delete", targetType: "listing", targetId: listing.id, targetLabel: listing.title, reason });
    return;
  }
  await api(`/api/admin/listings/${listing.id}`, { method: "DELETE", body: { reason } });
}

export async function fetchAuditLog(): Promise<AuditEntry[]> {
  if (!apiEnabled) return demoAudit;
  const { entries } = await api<{ entries: AuditEntry[] }>("/api/admin/audit?limit=50");
  return entries;
}

// ---- Overview (dashboard) ---------------------------------------------------
export type Overview = {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  onlineUsers: number;
  totalListings: number;
  activeListings: number;
  swappedListings: number;
  hiddenListings: number;
  swapsCompleted: number;
  swapsPending: number;
  orders: number;
  revenue: number;
  openReports: number;
  openDisputes: number;
  activeChats: number;
  series: { date: string; users: number; products: number; visitors: number; swaps: number }[];
  mostViewed: { title: string; views: number }[];
  topCategories: { category: string; count: number }[];
  topCities: { city: string; count: number }[];
  swapMix: { status: string; count: number }[];
};

export async function fetchOverview(days = 30): Promise<Overview> {
  if (!apiEnabled) {
    // Demo data when API is not enabled
    const listingCounts = {
      total: demoListings.length,
      active: demoListings.filter((l) => l.status === "active").length,
      hidden: demoListings.filter((l) => l.status === "hidden").length,
      swapped: demoListings.filter((l) => l.status === "swapped").length,
    };
    return {
      totalUsers: 248,
      activeUsers: 156,
      newUsersToday: 12,
      onlineUsers: 43,
      totalListings: listingCounts.total,
      activeListings: listingCounts.active,
      swappedListings: listingCounts.swapped,
      hiddenListings: listingCounts.hidden,
      swapsCompleted: 89,
      swapsPending: 12,
      orders: 101,
      revenue: 450,
      openReports: 3,
      openDisputes: 2,
      activeChats: 24,
      series: generateDemoSeries(),
      mostViewed: demoListings.slice(0, 4).map((l, i) => ({ title: l.title, views: 150 - i * 30 })),
      topCategories: [
        { category: "Dresses", count: 42 },
        { category: "Jeans", count: 38 },
        { category: "Tops", count: 35 },
      ],
      topCities: [
        { city: "London", count: 28 },
        { city: "Manchester", count: 15 },
        { city: "Birmingham", count: 12 },
      ],
      swapMix: [
        { status: "completed", count: 89 },
        { status: "pending", count: 12 },
        { status: "cancelled", count: 8 },
      ],
    };
  }

  // Real numbers from the backend — no fabricated counters in production.
  return api<Overview>(`/api/admin/overview?days=${days}`);
}

function generateDemoSeries() {
  const series = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push({
      date,
      users: Math.floor(Math.random() * 25) + 10,
      products: Math.floor(Math.random() * 20) + 8,
      visitors: Math.floor(Math.random() * 150) + 50,
      swaps: Math.floor(Math.random() * 12) + 3,
    });
  }
  return series;
}

// ---- Users (for user management) ------------------------------------------
export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  status: "active" | "suspended";
  createdAt: string;
  avatarUrl?: string | null;
  provider?: "local" | "google";
  age?: number | null;
  address?: string;
  phone?: string;
  shippingProfile?: { name?: string; line1?: string; line2?: string; city?: string; postal?: string; country?: string; phone?: string };
  shippingAddresses?: { id: string; label: string; name: string; line1: string; line2: string; city: string; postal: string; country: string; phone: string; isDefault: boolean }[];
};

export type UserQuery = { q: string; status: "all" | "active" | "suspended"; page?: number };

export async function fetchUsers(query: UserQuery): Promise<{ users: AdminUser[]; total: number; limit: number; pages: number; page: number }> {
  if (!apiEnabled) {
    // Return demo users when API is disabled
    const demoUsers: AdminUser[] = [
      {
        id: "u1",
        name: "Alice Johnson",
        username: "alice_j",
        email: "alice@example.com",
        status: "active",
        createdAt: new Date(Date.now() - 30 * 86400000).toISOString(),
      },
      {
        id: "u2",
        name: "Bob Smith",
        username: "bob_smith",
        email: "bob@example.com",
        status: "active",
        createdAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      },
    ];
    const q = query.q.trim().toLowerCase();
    const filtered = demoUsers.filter((u) => {
      if (q && !`${u.name} ${u.username} ${u.email}`.toLowerCase().includes(q)) return false;
      if (query.status !== "all" && u.status !== query.status) return false;
      return true;
    });
    const limit = 25;
    const page = query.page ?? 1;
    const start = (page - 1) * limit;
    return { users: filtered.slice(start, start + limit), total: filtered.length, limit, pages: Math.ceil(filtered.length / limit) || 1, page };
  }

  // Call real backend endpoint (when available)
  const search = new URLSearchParams({ q: query.q, status: query.status, page: String(query.page ?? 1) });
  try {
    return await api<{ users: AdminUser[]; total: number; limit: number; pages: number; page: number }>(`/api/admin/users?${search}`);
  } catch {
    // Fall back to demo if endpoint doesn't exist
    return { users: [], total: 0, limit: 25, pages: 0, page: 1 };
  }
}

export async function updateUserStatus(userId: string, status: "active" | "suspended", reason: string) {
  if (!apiEnabled) {
    // No-op for demo
    return;
  }
  await api(`/api/admin/users/${userId}/status`, { method: "PATCH", body: { status, reason } });
}

export async function fetchUserDetails(userId: string): Promise<{ user: AdminUser }> {
  return api<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(userId)}`);
}

export async function fetchUserDetailsBatch(userIds: string[]): Promise<{ users: AdminUser[] }> {
  if (!apiEnabled) {
    // Demo fallback: call single fetch for each id (no real batch store in demo)
    const users: AdminUser[] = [];
    for (const id of userIds) {
      try {
        const res = await fetchUserDetails(id);
        if (res?.user) users.push(res.user);
      } catch {
        // ignore
      }
    }
    return { users };
  }

  const search = new URLSearchParams();
  for (const id of userIds) search.append("id", id);
  try {
    // Prefer backend batch endpoint: /api/admin/users?id=...&id=...
    return await api<{ users: AdminUser[] }>(`/api/admin/users?${search.toString()}`);
  } catch {
    // Fallback to per-id fetch if batch endpoint not available
    const users: AdminUser[] = [];
    for (const id of userIds) {
      try {
        const res = await api<{ user: AdminUser }>(`/api/admin/users/${encodeURIComponent(id)}`);
        if (res?.user) users.push(res.user);
      } catch {}
    }
    return { users };
  }
}

// ---- Categories (marketplace taxonomy) -------------------------------------
export type AdminCategory = {
  slug: string;
  name: string;
  enabled: boolean;
  listings: number;
  order: number;
};

const DEMO_DISABLED_KEY = "swapt.demo.disabled-categories";

function demoDisabledCategories(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DEMO_DISABLED_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

const DEMO_CUSTOM_KEY = "swapt.demo.custom-categories";

function demoCustomCategories(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_CUSTOM_KEY) || "[]") as string[];
  } catch {
    return [];
  }
}

function setDemoCustomCategories(list: string[]) {
  localStorage.setItem(DEMO_CUSTOM_KEY, JSON.stringify(list));
}

function slugifyName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export async function fetchAdminCategories(): Promise<AdminCategory[]> {
  if (!apiEnabled) {
    const disabled = demoDisabledCategories();
    const base = CATEGORIES.map((name, i) => ({
      slug: slugifyName(name),
      name,
      enabled: !disabled.has(name),
      listings: 120 - ((i * 7) % 90),
      order: i,
    }));
    // include custom categories stored in localStorage
    const customs = demoCustomCategories().map((name, idx) => ({
      slug: slugifyName(name),
      name,
      enabled: true,
      listings: 0,
      order: base.length + idx,
    }));
    return [...base, ...customs];
  }
  const { items } = await api<{ items: AdminCategory[] }>("/api/admin/categories");
  return items;
}

export async function addAdminCategory(name: string) {
  if (!apiEnabled) {
    const list = demoCustomCategories();
    if (!list.includes(name)) {
      list.push(name);
      setDemoCustomCategories(list);
    }
    return;
  }
  await api("/api/admin/categories", { method: "POST", body: { name } });
}

export async function setCategoryEnabled(slug: string, enabled: boolean) {
  if (!apiEnabled) {
    const disabled = demoDisabledCategories();
    // Check builtin categories first
    const builtin = CATEGORIES.find((c) => slugifyName(c) === slug);
    if (builtin) {
      if (enabled) disabled.delete(builtin);
      else disabled.add(builtin);
      localStorage.setItem(DEMO_DISABLED_KEY, JSON.stringify([...disabled]));
      return;
    }
    // Otherwise, handle custom categories by toggling their presence in custom list (keeping them enabled/disabled via disabled set)
    const customs = demoCustomCategories();
    const name = customs.find((n) => slugifyName(n) === slug);
    if (name) {
      if (!enabled) {
        disabled.add(name);
      } else {
        disabled.delete(name);
      }
      localStorage.setItem(DEMO_DISABLED_KEY, JSON.stringify([...disabled]));
      return;
    }
    return;
  }
  await api(`/api/admin/categories/${encodeURIComponent(slug)}`, { method: "PATCH", body: { enabled } });
}

// ---- Proactive moderation queue ----

export type ModerationQueueItem = {
  id: string;
  title: string;
  brand: string;
  description: string;
  category: string;
  size: string;
  condition: string;
  value: number;
  images: string[];
  status: string;
  publishAt: string | null;
  moderationStatus: string;
  moderationReason: string;
  moderationScore: number;
  flaggedAt: string | null;
  seller: { username: string; name: string } | null;
  createdAt: string;
};

export async function fetchModerationQueue(page = 1): Promise<{ items: ModerationQueueItem[]; total: number; pages: number }> {
  if (!apiEnabled) {
    // Demo flagged sample
    return {
      items: [
        {
          id: "demo_flag_1",
          title: "Gucci replica tee — cheap!",
          brand: "Gucci",
          description: "Counterfeit Gucci with tags, DM on whatsapp me",
          category: "T-shirts",
          size: "M",
          condition: "New",
          value: 10,
          images: mockListings[0].images,
          status: "active",
          publishAt: null,
          moderationStatus: "flagged",
          moderationReason: 'Banned keyword: "replica"; Off-platform contact — risk of scam',
          moderationScore: 80,
          flaggedAt: new Date().toISOString(),
          seller: { username: "scam_seller", name: "Scam Seller" },
          createdAt: new Date().toISOString(),
        },
      ],
      total: 1,
      pages: 1,
    };
  }
  return api(`/api/admin/moderation/queue?page=${page}`);
}

export async function reviewModerationListing(id: string, action: "approve" | "reject" | "hide", note = "") {
  if (!apiEnabled) return;
  await api(`/api/admin/moderation/${id}/review`, { method: "PATCH", body: { action, note } });
}
