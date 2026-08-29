/**
 * Notification centre data layer.
 *
 * Backed by `/api/notifications` when the Express API is configured. Without
 * it, notifications live in localStorage so the panel behaves identically in
 * the design preview. The shape matches the Socket.IO payload emitted by the
 * server (`notification:new`), so switching to live push is a transport swap.
 */
import { api, apiEnabled } from "@/lib/api";

export const NOTIFICATION_KINDS = [
  "like",
  "swap_request",
  "swap_accepted",
  "message",
  "sold",
  "announcement",
  "welcome",
  "search_alert",
  "swap_match",
  "watch_alert",
  "dispute_message",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export type AppNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** In-app destination, e.g. "/listing/abc" */
  href?: string | null;
  actor?: string | null;
  readAt: string | null;
  createdAt: string;
};

const LOCAL_KEY = "swapt.notifications";

export const KIND_LABELS: Record<NotificationKind, string> = {
  like: "Item liked",
  swap_request: "Swap request",
  swap_accepted: "Swap accepted",
  message: "New message",
  sold: "Item sold",
  announcement: "Announcement",
  welcome: "Welcome",
  search_alert: "Saved search",
  swap_match: "It's a match!",
  watch_alert: "Price drop",
  dispute_message: "Dispute update",
};

function readLocal(): AppNotification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOCAL_KEY) ?? "null");
    if (Array.isArray(raw)) return raw as AppNotification[];
  } catch {
    /* fall through to seed */
  }
  const seeded = seed();
  writeLocal(seeded);
  return seeded;
}

function writeLocal(items: AppNotification[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function minutesAgo(m: number) {
  return new Date(Date.now() - m * 60_000).toISOString();
}

/** First-run content so the panel is never an empty shell before the API is wired. */
function seed(): AppNotification[] {
  const base: Array<Omit<AppNotification, "id" | "createdAt" | "readAt">> = [
    { kind: "like", title: "Someone liked your item", body: "Mila saved “Vintage Levi's 501” to their Bag.", href: "/browse", actor: "Mila K." },
    { kind: "swap_request", title: "New swap request", body: "Jonas wants to swap a Carhartt jacket for your denim skirt.", href: "/dashboard", actor: "Jonas P." },
    { kind: "message", title: "New message", body: "“Is this still available?”", href: "/dashboard", actor: "Ayesha R." },
    { kind: "swap_accepted", title: "Swap accepted 🎉", body: "Your swap with Tom is confirmed — arrange shipping.", href: "/dashboard", actor: "Tom H." },
    { kind: "sold", title: "Item sold", body: "“Nike windbreaker” found a new home.", href: "/dashboard", actor: null },
    { kind: "welcome", title: "Welcome to Swapt!", body: "Your account is ready. List your first item and start swapping today.", href: "/dashboard", actor: null },
    { kind: "announcement", title: "Swapt announcement", body: "Zero-fee swaps all weekend. Happy swapping!", href: "/browse", actor: "Swapt" },
    { kind: "like", title: "Someone liked your item", body: "3 people saved “Adidas track top” today.", href: "/browse", actor: null },
    { kind: "message", title: "New message", body: "“Could you post more photos of the sleeves?”", href: "/dashboard", actor: "Freya L." },
  ];
  return base.map((n, i) => ({
    ...n,
    id: `n_${i}`,
    createdAt: minutesAgo((i + 1) * 47),
    readAt: i > 3 ? minutesAgo((i + 1) * 40) : null,
  }));
}

export async function fetchNotifications(limit = 12): Promise<AppNotification[]> {
  if (!apiEnabled) {
    return readLocal()
      .slice()
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, limit);
  }
  const { items } = await api<{ items: AppNotification[] }>(`/api/notifications?limit=${limit}`);
  return items;
}

export async function markNotificationRead(id: string, read = true): Promise<void> {
  if (!apiEnabled) {
    writeLocal(
      readLocal().map((n) => (n.id === id ? { ...n, readAt: read ? new Date().toISOString() : null } : n)),
    );
    return;
  }
  await api(`/api/notifications/${id}/read`, { method: "PATCH", body: { read } });
}

export async function markAllNotificationsRead(): Promise<void> {
  if (!apiEnabled) {
    const now = new Date().toISOString();
    writeLocal(readLocal().map((n) => ({ ...n, readAt: n.readAt ?? now })));
    return;
  }
  await api("/api/notifications/read-all", { method: "POST" });
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
