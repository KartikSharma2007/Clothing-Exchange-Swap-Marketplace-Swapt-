import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Loader2, MessageCircle, Search, X } from "lucide-react";
import { Protected } from "@/components/site/Protected";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Avatar } from "@/components/site/Avatar";
import { fetchConversations, type ConversationSummary } from "@/lib/swap-api";
import { subscribeRealtime, realtimeOpen } from "@/lib/realtime";
import { apiEnabled } from "@/lib/api";
import { localeFromPrefs, relativeTime } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/messages/")({
  head: () => ({
    meta: [
      { title: "Messages — Swapt" },
      { name: "description", content: "Your Swapt chat threads — swap negotiations and plain-text messages." },
    ],
  }),
  component: () => (
    <Protected>
      <MessagesPage />
    </Protected>
  ),
});

function threadHref(c: ConversationSummary) {
  return c.swapId ? { to: "/swaps/$id" as const, params: { id: c.swapId } } : { to: "/messages/$conversationId" as const, params: { conversationId: c.id } };
}

function snippetOf(c: ConversationSummary): string {
  const last = c.lastMessage;
  if (!last) return "No messages yet — say hello 👋";
  const body = last.body?.trim() || "📷 Photo";
  return last.mine ? `You: ${body}` : body;
}

function MessagesPage() {
  const qc = useQueryClient();
  const inbox = useQuery({ queryKey: ["me", "conversations"], queryFn: fetchConversations });
  const [filter, setFilter] = useState("");

  // Live updates: refetch the inbox when a message lands on any thread.
  useEffect(() => {
    if (!apiEnabled) return;
    let alive = true;
    const unsub = subscribeRealtime((event) => {
      if (!alive) return;
      if (event.type === "message" || event.type === "read") {
        void qc.invalidateQueries({ queryKey: ["me", "conversations"] });
      }
    });
    const fallback = setInterval(() => {
      if (realtimeOpen()) return;
      void qc.invalidateQueries({ queryKey: ["me", "conversations"] });
    }, 15000);
    return () => {
      alive = false;
      unsub();
      clearInterval(fallback);
    };
  }, [qc]);

  const items = inbox.data?.items ?? [];
  const totalUnread = items.reduce((n, c) => n + c.unreadCount, 0);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (c) =>
        c.counterparty.name.toLowerCase().includes(needle) ||
        c.counterparty.username.toLowerCase().includes(needle) ||
        (c.lastMessage?.body ?? "").toLowerCase().includes(needle),
    );
  }, [items, filter]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar showDepartments={false} />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10 max-md:px-4 max-md:py-5 lg:max-w-4xl">
        {/* ── Header — mobile premium, desktop unchanged ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-3 max-md:gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-brand">
              <span className="h-4 w-1 rounded-full bg-brand" /> Inbox
            </p>
            <h1 className="mt-1.5 text-[26px] font-black leading-none tracking-tight sm:text-3xl">Messages</h1>
          </div>
          <span
            aria-live="polite"
            className={cn(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1",
              totalUnread > 0
                ? "bg-brand text-white ring-brand"
                : "bg-card text-foreground/60 ring-border",
            )}
          >
            {inbox.isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <>
                <MessageCircle className="h-3.5 w-3.5" />
                {totalUnread > 0 ? `${totalUnread} unread` : `${items.length} chat${items.length === 1 ? "" : "s"}`}
              </>
            )}
          </span>
        </div>

        {/* ── Search — mobile thumb-friendly, desktop unchanged ─────────────────────────────────────────── */}
        {items.length > 0 && (
          <div className="relative mt-5 max-md:mt-4">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground max-md:left-4 max-md:h-[18px] max-md:w-[18px]" />
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search chats by name or message…"
              aria-label="Filter conversations"
              className="w-full rounded-full border border-[#e9ddc3] bg-[#fdfaf5] py-3 pl-11 pr-10 text-[16px] shadow-sm outline-none transition-all placeholder:text-sm focus:border-brand/50 focus:ring-4 focus:ring-brand/10 sm:text-sm max-md:rounded-3xl max-md:py-3.5 max-md:pl-12 max-md:shadow-[0_2px_12px_rgba(0,0,0,0.04)]"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-foreground/50 hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}

        {/* ── List ───────────────────────────────────────────── */}
        {inbox.isLoading ? (
          <ul className="mt-5 space-y-2.5" aria-busy="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3.5 rounded-3xl border border-border bg-card p-4">
                <div className="h-13 w-13 shrink-0 animate-pulse rounded-full bg-muted" style={{ height: 52, width: 52 }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 animate-pulse rounded-full bg-muted" />
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-muted" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="mt-6 overflow-hidden rounded-3xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand/10 text-brand">
              <MessageCircle className="h-7 w-7" />
            </span>
            <p className="mt-4 text-lg font-black tracking-tight">No conversations yet</p>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-foreground/55">
              Message a seller from any listing or their profile — negotiations and plain-text chats both land here.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-3xl border border-dashed border-border px-6 py-12 text-center text-sm text-foreground/55">
            No chats match “{filter}”.
          </div>
        ) : (
          <ul className="mt-5 space-y-2.5 max-md:mt-4 max-md:space-y-3">
            {filtered.map((c) => {
              const href = threadHref(c);
              const when = c.lastMessage?.createdAt ? relativeTime(localeFromPrefs(), c.lastMessage.createdAt) : "";
              const unread = c.unreadCount > 0;
              return (
                <li key={c.id}>
                  <Link
                    {...href}
                    className={cn(
                      "group flex items-center gap-3.5 rounded-3xl border p-3.5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 sm:p-4 max-md:rounded-[1.5rem] max-md:p-4 max-md:gap-3 max-md:shadow-[0_2px_16px_rgba(0,0,0,0.04)] max-md:active:scale-[0.98]",
                      unread
                        ? "border-brand/25 bg-gradient-to-r from-brand/[0.06] to-transparent max-md:border-brand/20 max-md:shadow-[0_2px_12px_rgba(225,50,50,0.08)]"
                        : "border-[#e9ddc3] bg-[#fdfaf5] hover:border-foreground/15",
                    )}
                  >
                    {/* Avatar + presence */}
                    <div className="relative shrink-0">
                      <Avatar url={c.counterparty.avatarUrl} name={c.counterparty.name} size={52} className="ring-2 ring-background" />
                      <span
                        aria-hidden
                        className={cn(
                          "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-[2.5px] border-card",
                          unread ? "bg-brand" : "bg-emerald-500",
                        )}
                      />
                    </div>

                    {/* Name + snippet */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <p className={cn("truncate text-[15px]", unread ? "font-black text-foreground" : "font-semibold text-foreground/85")}>
                          {c.counterparty.name}
                        </p>
                        {c.swapId && (
                          <span
                            title="Swap negotiation thread"
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-foreground/55"
                          >
                            <ArrowLeftRight className="h-3 w-3" /> Swap
                          </span>
                        )}
                        {when && (
                          <span className={cn("ml-auto shrink-0 text-xs", unread ? "font-semibold text-brand" : "text-foreground/40")}>
                            {when}
                          </span>
                        )}
                      </div>
                      <p className={cn("mt-1 truncate text-sm", unread ? "font-medium text-foreground/75" : "text-foreground/50")}>
                        {snippetOf(c)}
                      </p>
                    </div>

                    {/* Unread count bubble — messenger style */}
                    {unread && (
                      <span className="grid h-7 min-w-7 shrink-0 animate-scale-in place-items-center rounded-full bg-brand px-2 text-xs font-black text-white shadow-sm shadow-brand/30">
                        {c.unreadCount > 99 ? "99+" : c.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {!inbox.isLoading && items.length > 0 && filtered.length > 0 && (
          <p className="mt-6 text-center text-xs text-foreground/40">
            Tip: swap threads open in the negotiation view with escrow & delivery tracking.
          </p>
        )}
      </main>
      <Footer />
    </div>
  );
}