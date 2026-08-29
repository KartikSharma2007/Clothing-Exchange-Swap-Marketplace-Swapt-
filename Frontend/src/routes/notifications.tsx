import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Filter, Trash2, Heart, MessageCircle, Repeat2, Megaphone, Sparkles, Search, Tag, HeartHandshake, CheckCheck } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotificationKind } from "@/lib/notifications-api";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Swapt" }] }),
  component: () => <Protected><NotificationsPage /></Protected>,
});

const ICONS: Record<string, typeof Bell> = { like: Heart, swap_request: Repeat2, swap_accepted: CheckCheck, message: MessageCircle, sold: Tag, announcement: Megaphone, welcome: Sparkles, search_alert: Search, swap_match: HeartHandshake };

function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationKind | "all">("all");
  const qc = useQueryClient();
  const { ago } = useI18n();
  const { data: all = [], isLoading } = useQuery({ queryKey: ["notifications", 50], queryFn: () => fetchNotifications(50) });
  const filtered = filter === "all" ? all : all.filter((n) => n.kind === filter);
  const unread = all.filter((n) => !n.readAt).length;
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8 md:px-8 max-md:px-4 max-md:py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 max-md:gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-black tracking-tight max-md:text-[26px] max-md:leading-none"><Bell className="h-6 w-6 text-brand" /> Notifications</h1>
            <p className="mt-1 text-sm text-foreground/60 max-md:text-xs">{unread} unread · {all.length} total</p>
          </div>
          {unread > 0 && (
            <button onClick={async () => { await markAllNotificationsRead(); await refresh(); }} className="inline-flex items-center gap-1.5 rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background hover:bg-foreground/90 max-md:min-h-11 max-md:px-5 max-md:py-3 max-md:rounded-full"><Check className="h-4 w-4" /> Mark all read</button>
          )}
        </div>

        <div className="mt-6 flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory max-md:-mx-4 max-md:px-4 max-md:scroll-ps-4 max-md:gap-2.5">
          <Filter className="h-4 w-4 text-foreground/40 shrink-0" />
          {["all", "like", "swap_request", "swap_accepted", "message", "search_alert", "welcome"].map((k) => (
            <button key={k} onClick={() => setFilter(k as any)} className={`shrink-0 rounded-full px-3 py-2.5 text-sm min-h-11 font-bold border ${filter === k ? "bg-foreground text-background border-foreground" : "border-border hover:bg-muted"}`}>{k === "all" ? "All" : k.replace("_", " ")}</button>
          ))}
        </div>

        <div className="mt-4 rounded-3xl border border-border bg-card overflow-hidden max-md:rounded-3xl max-md:mx-0">
          {isLoading ? (
            <div className="p-8 text-center text-sm text-foreground/60">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="grid place-items-center p-12 text-center max-md:p-8">
              <Bell className="h-10 w-10 text-foreground/20" />
              <p className="mt-3 font-bold">No notifications</p>
              <p className="text-sm text-foreground/60">{filter === "all" ? "You're all caught up" : `No ${filter} notifications`}</p>
              <Link to="/browse" className="mt-4 rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">Browse swaps</Link>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((n) => {
                const Icon = (ICONS as any)[n.kind] ?? Bell;
                return (
                  <li key={n.id} className={`flex gap-3 p-4 max-md:gap-3.5 max-md:p-4 ${!n.readAt ? "bg-brand/[0.04]" : ""}`}>
                    <span className={`grid h-9 w-9 place-items-center rounded-full ${!n.readAt ? "bg-brand/10 text-brand" : "bg-muted text-foreground/50"}`}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className={`text-sm ${!n.readAt ? "font-black" : "font-semibold"}`}>{n.title}</p>
                        {!n.readAt && <span className="mt-1 h-2 w-2 rounded-full bg-brand shrink-0" />}
                      </div>
                      <p className="mt-1 text-sm text-foreground/60">{n.body}</p>
                      <p className="mt-1 text-xs text-foreground/40">{ago(n.createdAt)} · {n.kind}</p>
                      {n.href && <Link to={n.href} className="mt-2 inline-flex text-xs font-bold text-brand hover:underline">View →</Link>}
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      {!n.readAt ? (
                        <button onClick={async () => { await markNotificationRead(n.id, true); await refresh(); }} className="rounded-full border border-border p-2 hover:bg-muted" title="Mark read"><Check className="h-3.5 w-3.5" /></button>
                      ) : (
                        <button onClick={async () => { await markNotificationRead(n.id, false); await refresh(); }} className="rounded-full border border-border p-2 hover:bg-muted" title="Mark unread"><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="mt-4 flex justify-between text-xs">
          <Link to="/settings" className="font-semibold text-foreground/60 hover:text-foreground">Notification settings →</Link>
          <Link to="/saved-searches" className="font-semibold text-foreground/60 hover:text-foreground">Saved searches →</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
