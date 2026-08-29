import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  Heart,
  MessageCircle,
  Megaphone,
  Repeat2,
  CheckCheck,
  Tag,
  Check,
  Sparkles,
  Search,
  HeartHandshake,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
  type NotificationKind,
} from "@/lib/notifications-api";
import { useI18n } from "@/lib/i18n";
import { usePreferences } from "@/lib/preferences";

/** Swap-activity kinds hidden from the bell when the "Swap activity" toggle is off. */
const SWAP_KINDS = new Set<NotificationKind>(["swap_request", "swap_accepted", "swap_match"]);

const ICONS: Record<NotificationKind, typeof Bell> = {
  like: Heart,
  swap_request: Repeat2,
  swap_accepted: CheckCheck,
  message: MessageCircle,
  sold: Tag,
  announcement: Megaphone,
  welcome: Sparkles,
  search_alert: Search,
  swap_match: HeartHandshake,
  watch_alert: Bell,
  dispute_message: ShieldAlert,
};

const TONES: Record<NotificationKind, string> = {
  like: "bg-brand/10 text-brand",
  swap_request: "bg-surface-lavender text-foreground",
  swap_accepted: "bg-emerald-500/12 text-emerald-600",
  message: "bg-sky-500/12 text-sky-600",
  sold: "bg-amber-500/15 text-amber-600",
  announcement: "bg-muted text-foreground/70",
  welcome: "bg-emerald-500/12 text-emerald-600",
  search_alert: "bg-violet-500/12 text-violet-600",
  swap_match: "bg-rose-500/12 text-rose-600",
  watch_alert: "bg-amber-500/10 text-amber-600",
  dispute_message: "bg-rose-500/10 text-rose-600",
};

export function NotificationBell() {
  const { ago } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { swapAlerts } = usePreferences();

  const { data: all = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(12),
    // Polling keeps the badge fresh today; Socket.IO `notification:new` can
    // simply invalidate this same key when the realtime server is running.
    refetchInterval: 60_000,
  });

  // The server also suppresses swap alerts when the toggle is off (Settings →
  // Notifications); this client-side filter keeps the demo/preview honest and
  // hides anything already in the inbox.
  const data = swapAlerts === false ? all.filter((n) => !SWAP_KINDS.has(n.kind)) : all;

  const unread = data.filter((n) => !n.readAt).length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notifications"] });

  const onItemClick = async (n: AppNotification) => {
    if (!n.readAt) {
      await markNotificationRead(n.id, true);
      await invalidate();
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-0 top-0 grid h-5 min-w-5 animate-scale-in place-items-center rounded-full bg-brand px-1 text-xs font-bold leading-none text-background ring-2 ring-background">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          /* Mobile: fixed, centred, always inside the viewport.
             Desktop (sm+): original right-anchored dropdown — unchanged. */
          className="fixed left-1/2 top-[4.75rem] z-[70] w-[calc(100vw-1.5rem)] max-w-md -translate-x-1/2 animate-scale-in overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-[22rem] sm:-translate-x-0 sm:rounded-2xl"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button
                  onClick={async () => {
                    await markAllNotificationsRead();
                    await invalidate();
                  }}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-brand hover:underline"
                >
                  <Check className="h-3.5 w-3.5" /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="rounded-full border border-border p-2 hover:bg-muted" aria-label="Close notifications">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="max-h-[min(58dvh,26rem)] overflow-y-auto overscroll-contain sm:max-h-[26rem]">
            {isLoading && (
              <ul className="divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => (
                  <li key={i} className="flex gap-3 px-4 py-3">
                    <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-full animate-pulse rounded bg-muted" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {!isLoading && data.length === 0 && (
              <div className="px-6 py-12 text-center">
                <Bell className="mx-auto h-8 w-8 text-foreground/25" />
                <p className="mt-3 text-sm font-semibold">You're all caught up</p>
                <p className="mt-1 text-xs text-foreground/55">
                  Likes, swap requests and messages land here.
                </p>
              </div>
            )}

            <ul className="divide-y divide-border">
              {data.map((n) => {
                const Icon = ICONS[n.kind] ?? Bell;
                const inner = (
                  <>
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${TONES[n.kind] ?? "bg-muted"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start gap-2">
                        <span className="flex-1 text-sm font-semibold leading-snug">{n.title}</span>
                        {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-foreground/65">{n.body}</span>
                      <span className="mt-1 block text-xs font-medium text-foreground/45">
                        {ago(n.createdAt)}
                      </span>
                    </span>
                  </>
                );
                const cls = `flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 active:bg-muted ${
                  n.readAt ? "" : "bg-brand/[0.04]"
                }`;
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link to={n.href} onClick={() => { setOpen(false); void onItemClick(n); }} className={cls}>
                        {inner}
                      </Link>
                    ) : (
                      <button onClick={() => void onItemClick(n)} className={cls}>
                        {inner}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-2.5">
            <Link to="/notifications" onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full text-xs font-bold text-brand hover:underline">
              <Bell className="h-3.5 w-3.5" /> View all
            </Link>
            <Link to="/saved-searches" onClick={() => setOpen(false)} className="inline-flex min-h-9 items-center gap-1.5 rounded-full text-xs font-semibold text-foreground/70 hover:text-foreground">
              <Search className="h-3.5 w-3.5" /> Saved searches
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
