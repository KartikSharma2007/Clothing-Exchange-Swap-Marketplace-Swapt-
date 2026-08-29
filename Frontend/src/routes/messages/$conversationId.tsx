import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, ImagePlus, Loader2, Search, Send, ShieldCheck, User, X } from "lucide-react";
import { Protected } from "@/components/site/Protected";
import { Avatar } from "@/components/site/Avatar";
import { fetchConversations, fetchMessagePage, markThreadRead, sendMessage, type ConversationSummary, type SwapMessage } from "@/lib/swap-api";
import { apiEnabled } from "@/lib/api";
import { subscribeRealtime, realtimeOpen } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/messages/$conversationId")({
  component: () => (
    <Protected>
      <ConversationThreadPage />
    </Protected>
  ),
});

function threadHref(c: ConversationSummary) {
  return c.swapId ? { to: "/swaps/$id" as const, params: { id: c.swapId } } : { to: "/messages/$conversationId" as const, params: { conversationId: c.id } };
}

function snippetOf(c: ConversationSummary): string {
  const last = c.lastMessage;
  if (!last) return "No messages yet";
  const body = last.body?.trim() || "📷 Photo";
  return last.mine ? `You: ${body}` : body;
}

function MessageBubble({ m, name }: { m: SwapMessage; name: string }) {
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={cn("flex items-end gap-2 max-md:gap-2", m.mine ? "justify-end" : "justify-start")}>
      {!m.mine && <Avatar url={null} name={name} size={28} className="mb-0.5 shrink-0 max-md:size-7" />}
      <div
        className={cn(
          "max-w-[82%] px-3.5 py-2.5 text-[15px] leading-relaxed shadow-sm sm:max-w-[70%] max-md:max-w-[78%] max-md:px-4 max-md:py-3 max-md:text-[15px] max-md:shadow-[0_2px_10px_rgba(0,0,0,0.05)]",
          m.mine
            ? "rounded-[1.25rem] rounded-br-md bg-gradient-to-br from-brand to-brand/90 text-brand-foreground max-md:rounded-[1.4rem] max-md:rounded-br-lg"
            : "rounded-[1.25rem] rounded-bl-md border border-border bg-card text-foreground max-md:rounded-[1.4rem] max-md:rounded-bl-lg max-md:border-border/60",
        )}
      >
        {m.image && (
          <a href={m.image} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
            <img src={m.image} alt="Shared photo" className="max-h-64 w-full object-cover transition-transform hover:scale-[1.02]" />
          </a>
        )}
        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
        <p className={cn("mt-1 text-right text-[11px] font-medium", m.mine ? "text-white/70" : "text-foreground/40")}>
          {time}
        </p>
      </div>
    </div>
  );
}

function ConversationThreadPage() {
  const { conversationId } = Route.useParams();
  const qc = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [olderPages, setOlderPages] = useState<SwapMessage[][]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const prevHeight = useRef(0);

  const thread = useQuery({
    queryKey: ["conversation", conversationId, "messages"],
    queryFn: () => fetchMessagePage(conversationId, undefined, conversationId),
    enabled: Boolean(conversationId),
  });
  const other = thread.data?.other ?? null;
  const otherName = other?.name ?? "Member";
  const allMessages = useMemo(() => [...olderPages.flat(), ...(thread.data?.items ?? [])], [olderPages, thread.data?.items]);

  // Desktop conversation switcher — shares the same query key as the inbox list, so it's warm if the person arrived from there.
  const inbox = useQuery({ queryKey: ["me", "conversations"], queryFn: fetchConversations });
  const [sidebarFilter, setSidebarFilter] = useState("");
  const sidebarItems = useMemo(() => {
    const all = inbox.data?.items ?? [];
    const needle = sidebarFilter.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (c) => c.counterparty.name.toLowerCase().includes(needle) || c.counterparty.username.toLowerCase().includes(needle),
    );
  }, [inbox.data?.items, sidebarFilter]);

  useEffect(() => {
    if (thread.data) {
      setHasMore(thread.data.hasMore);
      setNextCursor(thread.data.nextCursor);
    }
  }, [thread.data]);

  useEffect(() => {
    if (!conversationId) return;
    void markThreadRead(conversationId, conversationId).catch(() => {});
  }, [conversationId]);

  // Live updates + slow fallback poll.
  useEffect(() => {
    if (!conversationId || !apiEnabled) return;
    let alive = true;
    const unsub = subscribeRealtime((event) => {
      if (!alive) return;
      if (event.type === "message" || event.type === "read") {
        void qc.invalidateQueries({ queryKey: ["conversation", conversationId, "messages"] });
        void qc.invalidateQueries({ queryKey: ["me", "conversations"] });
      }
    });
    const fallback = setInterval(() => {
      if (realtimeOpen()) return;
      void qc.invalidateQueries({ queryKey: ["conversation", conversationId, "messages"] });
    }, 15000);
    return () => {
      alive = false;
      unsub();
      clearInterval(fallback);
    };
  }, [conversationId, qc]);

  // Snap to newest message on load / when one arrives.
  useEffect(() => {
    if (!thread.isLoading && listRef.current) {
      const list = listRef.current;
      const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
      if (distanceFromBottom < 96) list.scrollTop = list.scrollHeight;
    }
  }, [thread.isLoading, thread.data?.items?.length]);

  const loadOlder = async () => {
    if (!hasMore || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const before = listRef.current?.scrollHeight ?? 0;
    prevHeight.current = before;
    try {
      const page = await fetchMessagePage(conversationId, nextCursor, conversationId);
      setOlderPages((p) => [...p, page.items]);
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight - prevHeight.current;
      });
    } catch {
      /* ignore load-older errors */
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (image?: File | null) => {
    const body = draft.trim();
    if ((!body && !image) || sending) return;
    setSending(true);
    try {
      const msg = await sendMessage(conversationId, body, conversationId, image ?? null);
      setDraft("");
      setImageFile(null);
      setOlderPages([]);
      setHasMore(false);
      setNextCursor(null);
      qc.setQueryData<{ items: SwapMessage[]; hasMore: boolean; nextCursor: string | null; other?: typeof other }>(
        ["conversation", conversationId, "messages"],
        (old) => (old ? { ...old, items: [...old.items, msg] } : old),
      );
      void qc.invalidateQueries({ queryKey: ["me", "conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send message");
    } finally {
      setSending(false);
    }
  };

  const onScroll = () => {
    if (!listRef.current || !hasMore || loadingOlder) return;
    if (listRef.current.scrollTop < 40) void loadOlder();
  };

  // Day dividers between messages.
  const timeline = useMemo(() => {
    const out: (SwapMessage | { type: "day"; label: string })[] = [];
    let lastDay = "";
    const today = new Date().toDateString();
    for (const m of allMessages) {
      const d = new Date(m.createdAt);
      const day = d.toDateString();
      if (day !== lastDay) {
        lastDay = day;
        out.push({
          type: "day",
          label:
            day === today
              ? "Today"
              : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }),
        });
      }
      out.push(m);
    }
    return out;
  }, [allMessages]);

  const imagePreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  return (
    <div className="h-[100dvh] overflow-hidden bg-background">
      <div className="mx-auto flex h-full w-full max-w-3xl lg:max-w-6xl lg:gap-4 sm:px-4 sm:py-4">
        {/* ── Desktop conversation switcher — keeps the inbox visible beside the open thread, like Gmail/Slack ── */}
        <aside className="hidden w-[300px] shrink-0 flex-col overflow-hidden rounded-[1.5rem] border border-[#e9ddc3] bg-[#fdfaf5] lg:flex">
          <div className="shrink-0 border-b border-[#e9ddc3] px-4 py-3.5">
            <Link to="/messages" className="text-[11px] font-black uppercase tracking-[0.15em] text-foreground/45 transition-colors hover:text-brand">
              ← All chats
            </Link>
            <h2 className="mt-1 font-serif text-lg font-bold tracking-tight text-foreground">Messages</h2>
          </div>
          <div className="relative shrink-0 border-b border-[#e9ddc3] px-3 py-2.5">
            <Search className="pointer-events-none absolute left-6 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-foreground/35" />
            <input
              type="search"
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              placeholder="Search chats…"
              aria-label="Search conversations"
              className="w-full rounded-full border border-[#e9ddc3] bg-card py-2 pl-8 pr-3 text-xs outline-none transition-all focus:border-brand/50 focus:ring-2 focus:ring-brand/10"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {inbox.isLoading ? (
              <div className="space-y-1.5 p-1" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5 rounded-xl p-2">
                    <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#efe3c8]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-[#efe3c8]" />
                      <div className="h-2 w-1/2 animate-pulse rounded-full bg-[#efe3c8]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : sidebarItems.length === 0 ? (
              <p className="p-4 text-center text-xs text-foreground/45">
                {sidebarFilter ? `No chats match “${sidebarFilter}”.` : "No conversations yet."}
              </p>
            ) : (
              <ul className="space-y-1">
                {sidebarItems.map((c) => {
                  const href = threadHref(c);
                  const active = c.id === conversationId;
                  const unread = c.unreadCount > 0;
                  return (
                    <li key={c.id}>
                      <Link
                        {...href}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl p-2 transition-colors",
                          active ? "bg-violet-100/70 ring-1 ring-violet-200" : "hover:bg-[#f3e9cf]/60",
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar url={c.counterparty.avatarUrl} name={c.counterparty.name} size={40} />
                          {unread && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[#fdfaf5] bg-brand" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <p className={cn("truncate text-[13px]", unread ? "font-black text-foreground" : "font-semibold text-foreground/80")}>
                              {c.counterparty.name}
                            </p>
                            {c.swapId && <ArrowLeftRight className="h-2.5 w-2.5 shrink-0 text-foreground/35" />}
                          </div>
                          <p className={cn("truncate text-[11px]", unread ? "font-medium text-foreground/65" : "text-foreground/40")}>
                            {snippetOf(c)}
                          </p>
                        </div>
                        {unread && (
                          <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full bg-brand px-1 text-[10px] font-black text-white">
                            {c.unreadCount > 9 ? "9+" : c.unreadCount}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-card/40 sm:rounded-[1.5rem] sm:border sm:border-[#e9ddc3] sm:shadow-sm">
          {/* ── Header — mobile premium, desktop unchanged ─────────────────────────────────────── */}
          <header className="flex shrink-0 items-center gap-2.5 border-b border-border bg-card/95 px-3 py-2.5 backdrop-blur sm:gap-3 sm:px-4 max-md:px-4 max-md:py-3 max-md:gap-3 max-md:bg-card/90 max-md:backdrop-blur-xl">
            <Link
              to="/messages"
              aria-label="Back to messages"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <Avatar url={other?.avatarUrl} name={otherName} size={40} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-black tracking-tight">{otherName}</p>
              <p className="flex items-center gap-1 truncate text-xs text-emerald-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active now
                {other?.username && <span className="text-foreground/45">· @{other.username}</span>}
              </p>
            </div>
            {other?.username && (
              <Link
                to="/seller/$username"
                params={{ username: other.username }}
                title={`View ${otherName}'s profile`}
                aria-label={`View ${otherName}'s profile`}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand active:bg-muted"
              >
                <User className="h-[18px] w-[18px]" />
              </Link>
            )}
          </header>

          {/* ── Trust strip ────────────────────────────────── */}
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-muted/30 px-4 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            <p className="truncate text-xs text-foreground/55">
              Never pay outside Swapt — keep swaps and credits in the app for full protection.
            </p>
          </div>

          {/* ── Transcript — mobile spacious, desktop unchanged ─────────────────────────────────── */}
          <div
            ref={listRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6 max-md:px-4 max-md:py-5 max-md:space-y-3"
          >
            {hasMore && (
              <div className="flex justify-center pb-1">
                <button
                  onClick={() => void loadOlder()}
                  disabled={loadingOlder}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-background px-4 text-xs font-semibold transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
                  {loadingOlder ? "Loading…" : "Load older messages"}
                </button>
              </div>
            )}

            {thread.isLoading ? (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </p>
            ) : timeline.length === 0 ? (
              <div className="grid h-full place-items-center px-6 text-center">
                <div>
                  <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-brand/10 text-brand">
                    <Send className="h-7 w-7" />
                  </span>
                  <p className="mt-4 font-black tracking-tight">No messages yet</p>
                  <p className="mt-1 text-sm text-foreground/50">Say hello to {otherName.split(" ")[0] || "them"} — this is a plain-text chat.</p>
                </div>
              </div>
            ) : (
              timeline.map((item, i) =>
                "type" in item ? (
                  <div key={`day-${i}`} className="my-3 flex justify-center">
                    <span className="rounded-full bg-background/85 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground/45 ring-1 ring-border">
                      {item.label}
                    </span>
                  </div>
                ) : (
                  <MessageBubble key={item.id} m={item} name={otherName} />
                ),
              )
            )}
          </div>

          {/* ── Composer — mobile thumb-friendly, desktop unchanged ───────────────────────────────────── */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (sending) return;
              void send(imageFile);
            }}
            className="shrink-0 border-t border-border bg-card/95 px-3 pt-2.5 backdrop-blur sm:px-4 max-md:px-4 max-md:pt-3 max-md:bg-card max-md:border-t max-md:shadow-[0_-4px_20px_rgba(0,0,0,0.04)]"
            style={{ paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
          >
            {imageFile && imagePreview && (
              <div className="mb-2 flex items-center gap-2.5 rounded-2xl border border-border bg-background p-2 pr-3">
                <img src={imagePreview} alt="Attached photo preview" className="h-12 w-12 rounded-xl object-cover" />
                <span className="min-w-0 flex-1 truncate text-xs text-foreground/60">{imageFile.name}</span>
                <button
                  type="button"
                  onClick={() => setImageFile(null)}
                  aria-label="Remove attached photo"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-foreground/50 transition-colors hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 pb-1">
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={(e) => {
                  setImageFile(e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                aria-label="Attach a photo to your message"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/45 transition-colors hover:bg-muted hover:text-brand active:bg-muted"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`Message ${otherName.split(" ")[0] || ""}…`.trim()}
                maxLength={1000}
                enterKeyHint="send"
                className="min-h-11 flex-1 rounded-full border border-border bg-background px-4 text-[16px] outline-none transition-all placeholder:text-sm placeholder:text-foreground/40 focus:border-brand/60 focus:ring-4 focus:ring-brand/10 sm:text-sm"
              />
              <button
                type="submit"
                disabled={sending || (!draft.trim() && !imageFile)}
                aria-label="Send message"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-md shadow-brand/30 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-brand/40 active:translate-y-0 disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}