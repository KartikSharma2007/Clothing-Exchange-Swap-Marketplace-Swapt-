import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Award, Calendar, Check, CheckCheck, ChevronDown, Clock, Handshake, HelpCircle, ImagePlus, Info, Layers, Loader2, Map as MapIcon, MapPin, MessageCircle, Package, PackageCheck, Pencil, Printer, Satellite, Scale, Send, Shield, Truck, User, X, XCircle } from "lucide-react";
import { Protected } from "@/components/site/Protected";
import { Avatar } from "@/components/site/Avatar";
import { ConfirmDialog } from "@/components/site/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { confirmSwapReceipt, counterSwap, fetchMessagePage, fetchSwap, markThreadRead, sendMessage, updateSwapMeetup, updateSwapStatus, updateSwapTracking, type SwapMessage, type SwapStatus } from "@/lib/swap-api";
import type { SwapRecord } from "@/lib/dashboard-api";
import { ApiError, apiEnabled } from "@/lib/api";
import { realtimeOpen, sendTyping, subscribeRealtime } from "@/lib/realtime";
import { DISPUTE_REASONS, fetchSwapDisputes, openSwapDispute, uploadDisputeEvidence, fetchDisputeMessages, sendDisputeMessage, type SwapDispute } from "@/lib/moderation-api";
import { toast } from "sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LocationPicker } from "@/components/site/LocationPicker";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/swaps/$id")({
  component: () => (
    <Protected>
      <SwapChatPage />
    </Protected>
  ),
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusTone(status: string) {
  if (status === "accepted") return "bg-emerald-100 text-emerald-700";
  if (status === "declined" || status === "cancelled") return "bg-rose-100 text-rose-700";
  if (status === "completed") return "bg-sky-100 text-sky-700";
  return "bg-amber-100 text-amber-700";
}

/** Compact countdown ("2d 3h left") for the pending-expiry badge. */
function expiryLabel(iso: string, now: number): string {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return "Expires soon";
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h left`;
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${Math.max(1, mins)}m left`;
}

/** Net credits the requester owes — requested value minus the offered clothing bundle. */
function toSafeNumber(value: number | string | null | undefined): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function netCredits(swap: SwapRecord): number {
  const requested = toSafeNumber(swap.requestedValue ?? swap.requestedListing?.value ?? 0);
  const offeredValue = toSafeNumber(
    swap.offeredValue ?? (swap.offeredBundle?.length
      ? swap.offeredBundle.reduce((s, l) => s + toSafeNumber(l?.value), 0)
      : (swap.offeredListings?.length
        ? swap.offeredListings.reduce((s, l) => s + toSafeNumber(l?.value), 0)
        : (swap.offeredListing ? toSafeNumber(swap.offeredListing.value) : 0))),
  );
  return Math.max(0, requested - offeredValue);
}

/**
 * OpenStreetMap embed for a meetup. Prefers the exact meetup pin chosen via
 * LocationPicker (swap.meetupLat/Lng), then falls back to the listing's own
 * coordinates. Returns null when no precise pin exists — we don't use the
 * `?query=` OSM embed (it shows a broken/empty map) but render external links.
 */
function meetupMapEmbed(swap: SwapRecord): string | null {
  if (swap.meetupLat != null && swap.meetupLng != null) {
    const dLat = 0.006;
    const dLng = 0.012;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${swap.meetupLng - dLng}%2C${swap.meetupLat - dLat}%2C${swap.meetupLng + dLng}%2C${swap.meetupLat + dLat}&layer=mapnik&marker=${swap.meetupLat}%2C${swap.meetupLng}`;
  }
  const item = swap.requestedListing;
  if (item?.lat != null && item?.lng != null) {
    const dLat = 0.006;
    const dLng = 0.012;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${item.lng - dLng}%2C${item.lat - dLat}%2C${item.lng + dLng}%2C${item.lat + dLat}&layer=mapnik&marker=${item.lat}%2C${item.lng}`;
  }
  return null;
}

function meetupCoords(swap: SwapRecord): { lat: number; lng: number } | null {
  if (swap.meetupLat != null && swap.meetupLng != null) return { lat: swap.meetupLat, lng: swap.meetupLng };
  const item = swap.requestedListing as unknown as { lat?: number; lng?: number } | null;
  if (item?.lat != null && item?.lng != null) return { lat: item.lat, lng: item.lng };
  return null;
}

/** Leaflet + Esri World Imagery HTML for a satellite view — used via iframe srcDoc (no API key). */
function satelliteMapHtml(lat: number, lng: number): string {
  const safeLat = Number(lat).toFixed(6);
  const safeLng = Number(lng).toFixed(6);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script><style>html,body{height:100%;margin:0;padding:0;background:#0f172a} #map{height:100%;width:100%} .leaflet-control-attribution{font-size:9px;background:rgba(255,255,255,0.88)!important;padding:2px 6px;border-radius:999px;margin:6px!important;line-height:1}</style></head><body><div id="map"></div><script>var map=L.map('map',{zoomControl:false,attributionControl:true}).setView([${safeLat},${safeLng}],16);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19, attribution:'© Esri, Maxar'}).addTo(map);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_BoundariesAndPlaces/MapServer/tile/{z}/{y}/{x}',{maxZoom:19}).addTo(map);L.marker([${safeLat},${safeLng}],{icon:L.divIcon({className:'',html:'<div style="width:18px;height:18px;background:#10b981;border:3px solid white;border-radius:50%;box-shadow:0 2px 10px rgba(0,0,0,0.45),0 0 0 6px rgba(16,185,129,0.2)"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(map);<\/script></body></html>`;
}

/** Small ? icon that reveals an explanatory tooltip on hover/focus — uses Radix Portal so it never clips outside the chat. */
function HelpTooltip({
  text,
  label,
  side = "bottom",
  align = "center",
}: {
  text: string;
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  align?: "center" | "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-foreground/15 bg-card text-foreground/60 shadow-sm transition-all hover:border-brand/30 hover:bg-brand/5 hover:text-brand hover:shadow-md active:bg-brand/10 active:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 max-md:h-11 max-md:w-11 max-md:min-h-11 max-md:border-border max-md:bg-card max-md:shadow-sm"
          >
            <HelpCircle className="h-3.5 w-3.5 max-md:h-4 max-md:w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          sideOffset={8}
          onEscapeKeyDown={() => setOpen(false)}
          onPointerDownOutside={() => setOpen(false)}
          className="z-[70] max-w-[min(18rem,calc(100vw-2rem))] whitespace-normal rounded-xl border border-border bg-foreground px-3 py-2.5 text-xs leading-relaxed text-background shadow-xl"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DisputeChatPanel({ swapId, disputeId, isOpen }: { swapId: string; disputeId: string; isOpen: boolean }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const disputeImageRef = useRef<HTMLInputElement | null>(null);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["dispute-chat", swapId, disputeId],
    queryFn: () => fetchDisputeMessages(swapId, disputeId),
    enabled: Boolean(swapId && disputeId),
  });
  const send = async () => {
    const body = draft.trim();
    if ((!body && !imageFile) || sending) return;
    setSending(true);
    try {
      await sendDisputeMessage(swapId, disputeId, body, imageFile);
      setDraft("");
      setImageFile(null);
      if (disputeImageRef.current) disputeImageRef.current.value = "";
      void refetch();
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(err instanceof Error ? err.message : "Couldn't send dispute message");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="border-b border-amber-200 bg-amber-50/40">
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-amber-600 text-white"><MessageCircle className="h-3.5 w-3.5" /></span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-amber-900">Dispute chat — separate from swap chat</p>
          <p className="text-xs text-amber-700/70">Talk directly with the other party + moderators. Evidence photos are in the banner above. Photos allowed.</p>
        </div>
        <span className={`rounded-full px-2.5 py-2 text-sm min-h-9 font-bold ${isOpen ? "bg-amber-600 text-white" : "bg-emerald-600 text-white"}`}>{isOpen ? "Open" : "Resolved"}</span>
      </div>
      <div className="mx-3 mb-3 rounded-2xl border border-amber-200 bg-white overflow-hidden">
        <div className="max-h-48 overflow-y-auto p-3 space-y-2">
          {isLoading ? (
            <p className="text-xs text-foreground/50 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Loading dispute messages…</p>
          ) : !data?.items.length ? (
            <p className="text-xs text-foreground/50">No messages yet — say hi to start the mediation thread.</p>
          ) : (
            data.items.map((m) => (
              <div key={m.id} className={`flex gap-2 ${m.mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${m.mine ? "bg-amber-600 text-white" : m.author === "moderator" ? "bg-sky-100 text-sky-900 border border-sky-200" : "bg-muted"}`}>
                  <p className="font-bold text-xs opacity-70">{m.author}</p>
                  {m.body ? <p className="mt-0.5 leading-relaxed">{m.body}</p> : null}
                  {m.image ? <img src={m.image} alt="dispute attachment" className="mt-2 max-h-32 rounded-lg object-cover" loading="lazy" /> : null}
                  <p className="mt-1 text-xs opacity-60">{new Date(m.createdAt).toLocaleString()}</p>
                </div>
              </div>
            ))
          )}
        </div>
        {isOpen && (
          <div className="border-t border-amber-200 p-2 bg-amber-50/30 space-y-2">
            {imageFile && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-2 py-2 text-sm min-h-9">
                <ImagePlus className="h-3.5 w-3.5 text-amber-700" />
                <span className="flex-1 truncate">{imageFile.name}</span>
                <button onClick={() => { setImageFile(null); if (disputeImageRef.current) disputeImageRef.current.value = ""; }} className="rounded-full bg-muted px-2.5 py-2 text-sm min-h-9 font-bold">Remove</button>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => disputeImageRef.current?.click()} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-amber-200 bg-white text-amber-700 hover:bg-amber-50" title="Attach photo"><ImagePlus className="h-4 w-4" /></button>
              <input ref={disputeImageRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setImageFile(f); }} />
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), void send())} placeholder="Message the other party + moderator…" className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs outline-none focus:border-amber-500" maxLength={1000} />
              <button onClick={() => void send()} disabled={sending || (!draft.trim() && !imageFile)} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"><Send className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SwapChatPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { refresh: refreshAuth } = useAuth();
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [olderPages, setOlderPages] = useState<SwapMessage[][]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [statusBusy, setStatusBusy] = useState<SwapStatus | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<SwapStatus | null>(null);
  const [counterpartyTyping, setCounterpartyTyping] = useState(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevHeight = useRef(0);

  const swap = useQuery({ queryKey: ["swap", id], queryFn: () => fetchSwap(id), enabled: Boolean(id) });
  const conversationId = swap.data?.conversationId ?? null;
  const messages = useQuery({
    queryKey: ["swap", id, "messages", conversationId],
    queryFn: () => fetchMessagePage(id, undefined, conversationId),
    // Always load once we have the swap id — fetchMessagePage falls back to the
    // swap id when the thread's conversationId is missing on older swaps.
    enabled: Boolean(id),
  });

  const allMessages = [...olderPages.flat(), ...(messages.data?.items ?? [])];

  // Sync pagination state from the latest fetched page — otherwise "Load older messages" never appears on first load
  useEffect(() => {
    if (messages.data) {
      setHasMore(messages.data.hasMore);
      setNextCursor(messages.data.nextCursor);
    }
  }, [messages.data]);

  // Mark the thread read when it opens.
  useEffect(() => {
    if (!id) return;
    void markThreadRead(id, conversationId).catch(() => {});
  }, [id, conversationId]);

  // Live updates: the backend pushes a small event over WebSocket the moment a
  // message/status changes on this swap, and we refetch. A slow fallback poll
  // keeps the thread fresh only while the socket isn't connected.
  useEffect(() => {
    if (!id || !apiEnabled) return;
    let alive = true;
    const unsub = subscribeRealtime((event) => {
      if (event.swapId !== id || !alive) return;
      if (event.type === "typing") {
        const cid = swap.data?.counterpartyId;
        if (cid && event.from === cid) {
          setCounterpartyTyping(Boolean(event.typing));
          if (event.typing) {
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setCounterpartyTyping(false), 3500);
          }
        }
        return;
      }
      void qc.invalidateQueries({ queryKey: ["swap", id] });
      void qc.invalidateQueries({ queryKey: ["swap", id, "messages"] });
    });
    const fallback = setInterval(() => {
      if (realtimeOpen()) return;
      void qc.invalidateQueries({ queryKey: ["swap", id, "messages"] });
    }, 15000);
    return () => {
      alive = false;
      unsub();
      clearInterval(fallback);
      if (typingTimer.current) clearTimeout(typingTimer.current);
    };
  }, [id, qc, swap.data?.counterpartyId]);

  const changeStatus = async (status: SwapStatus) => {
    if (statusBusy) return;
    // Irreversible moves and accepting a binding swap need a confirmation so a
    // mis-click can't end the negotiation or lock in credits.
    const needsConfirm = status === "declined" || status === "cancelled" || status === "completed" || status === "accepted";
    if (needsConfirm && !confirmStatus) {
      setConfirmStatus(status);
      return;
    }
    setStatusBusy(status);
    try {
      await updateSwapStatus(id, status);
      await qc.invalidateQueries({ queryKey: ["swap", id] });
      await qc.invalidateQueries({ queryKey: ["swap", id, "messages"] });
      // In demo mode a completed/accepted swap moves credits — reflect them.
      if (!apiEnabled) void refreshAuth();
      // Prominent feedback so both parties clearly see what happened.
      if (status === "accepted") toast.success("Swap accepted — you're locked in! Credits are held until completion.");
      else if (status === "declined") toast.success("Swap declined. The requester has been notified.");
      else if (status === "cancelled") toast.success("Swap cancelled.");
      else if (status === "completed") toast.success("Swap marked as completed!");
    } catch (err) {
      let msg = "Couldn't update swap status. Please try again.";
      let description: string | undefined;
      let action: { label: string; onClick: () => void } | undefined;
      if (err instanceof ApiError) {
        msg = (err.body?.error as string) || err.message || msg;
        if (err.status === 0) {
          description = "Backend not reachable — run the API on http://localhost:4000 or unset VITE_API_URL for demo mode.";
        } else if ((err.body as Record<string, unknown>)?.needed != null) {
          const needed = (err.body as { needed?: number }).needed;
          const balance = (err.body as { balance?: number }).balance ?? 0;
          description = `Available: ${balance} credits — needs ${needed}.`;
          action = {
            label: "Go to wallet",
            onClick: () => void navigate({ to: "/wallet" }),
          };
          // For credit errors keep the main msg but add context
          if (status === "accepted") msg = `Cannot accept — requester needs ${needed} credits.`;
        } else if (err.status === 404) {
          description = "Swap not found or you don't have access.";
        } else if (err.status === 409) {
          description = undefined; // msg already specific
        }
      } else if (err instanceof Error) {
        msg = err.message || msg;
      }
      toast.error(msg, description || action ? { description, action } : undefined);
    } finally {
      setStatusBusy(null);
      setConfirmStatus(null);
    }
  };

  // Snap to the newest message on load / when a new one arrives.
  useEffect(() => {
    if (!messages.isLoading && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.isLoading, messages.data?.items?.length]);

  const loadOlder = async () => {
    if (!hasMore || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const before = listRef.current?.scrollHeight ?? 0;
    prevHeight.current = before;
    try {
      const page = await fetchMessagePage(id, nextCursor, conversationId);
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
      const msg = await sendMessage(id, body, conversationId, image ?? null);
      setDraft("");
      setOlderPages([]);
      setHasMore(false);
      setNextCursor(null);
      qc.setQueryData<{ items: SwapMessage[]; hasMore: boolean; nextCursor: string | null }>(
        ["swap", id, "messages", conversationId],
        (old) => (old ? { ...old, items: [...old.items, msg] } : old),
      );
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

  return (
    <div className="h-[100dvh] min-h-[100dvh] overflow-hidden bg-background">
      {swap.isLoading ? (
        <div className="grid h-full place-items-center gap-2 text-sm text-foreground/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading conversation…
        </div>
      ) : !swap.data ? (
        <div className="grid h-full place-items-center p-6">
          <p className="max-w-sm rounded-xl border border-border p-4 text-sm text-foreground/70">
            This swap doesn't exist or you don't have access to it.
          </p>
        </div>
      ) : (
        <SwapChatInner
          swap={swap.data}
          allMessages={allMessages}
          messagesLoading={messages.isLoading}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
          onLoadOlder={loadOlder}
          onScroll={onScroll}
          listRef={listRef}
          draft={draft}
          setDraft={setDraft}
          sending={sending}
          send={send}
          statusBusy={statusBusy}
          changeStatus={changeStatus}
          counterpartyTyping={counterpartyTyping}
        />
      )}
      <ConfirmDialog
        open={Boolean(confirmStatus) && confirmStatus !== "accepted"}
        title={
          confirmStatus === "declined"
            ? "Decline this swap?"
            : confirmStatus === "cancelled"
              ? "Cancel this swap request?"
              : `Mark this swap as ${confirmStatus ?? ""}?`
        }
        description={
          confirmStatus === "declined" ? (
            <span>
              The requester will be notified that you declined. No credits will be moved and this decision uses a system message so it's clear to both sides.
            </span>
          ) : confirmStatus === "cancelled" ? (
            <span>Withdrawing releases any held credits and notifies the owner. You can propose again later.</span>
          ) : confirmStatus === "completed" ? (
            <span>Both parties agreed the exchange is finished — this releases escrow and marks the items as swapped.</span>
          ) : (
            "This can't be undone."
          )
        }
        confirmLabel={
          confirmStatus === "declined"
            ? "Yes, decline"
            : confirmStatus === "cancelled"
              ? "Yes, cancel"
              : confirmStatus === "completed"
                ? "Mark completed"
                : `Yes, ${confirmStatus ?? ""}`
        }
        variant={confirmStatus === "completed" ? "brand" : "danger"}
        busy={Boolean(statusBusy)}
        onConfirm={() => void changeStatus(confirmStatus as SwapStatus)}
        onClose={() => setConfirmStatus(null)}
      />
      {swap.data && confirmStatus === "accepted" && (
        <AcceptSummaryDialog
          swap={swap.data}
          busy={Boolean(statusBusy)}
          onConfirm={() => void changeStatus("accepted")}
          onClose={() => setConfirmStatus(null)}
        />
      )}
    </div>
  );
}

function SwapChatInner({
  swap,
  allMessages,
  messagesLoading,
  hasMore,
  loadingOlder,
  onLoadOlder,
  onScroll,
  listRef,
  draft,
  setDraft,
  sending,
  send,
  statusBusy,
  changeStatus,
  counterpartyTyping,
}: {
  swap: SwapRecord;
  allMessages: SwapMessage[];
  messagesLoading: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onScroll: () => void;
  listRef: React.RefObject<HTMLDivElement | null>;
  draft: string;
  setDraft: (v: string) => void;
  sending: boolean;
  send: (image?: File | null) => void;
  statusBusy: SwapStatus | null;
  changeStatus: (status: SwapStatus) => void;
  counterpartyTyping: boolean;
}) {
  const qc = useQueryClient();
  const bundleListings = swap.offeredBundle?.length ? swap.offeredBundle : (swap.offeredListings?.length ? swap.offeredListings : (swap.offeredListing ? [swap.offeredListing] : []));
  const listings = [swap.requestedListing, ...bundleListings].filter((l): l is NonNullable<typeof l> => Boolean(l));

  const [disputeOpen, setDisputeOpen] = useState(false);
  const [disputeReason, setDisputeReason] = useState<(typeof DISPUTE_REASONS)[number]>("Other");
  const [disputeDesc, setDisputeDesc] = useState("");
  const [disputeFiles, setDisputeFiles] = useState<File[]>([]);
  const [disputeBusy, setDisputeBusy] = useState(false);
  const [disputeError, setDisputeError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);

  const disputes = useQuery({
    queryKey: ["swap", swap.id, "disputes"],
    queryFn: () => fetchSwapDisputes(swap.id),
    enabled: Boolean(swap.dispute) && Boolean(swap.id),
  });
  const disputeDetail: SwapDispute | undefined = disputes.data?.items[0] ?? undefined;

  const returnWindow = (() => {
    const vals = [swap.requestedListing as any, ...bundleListings].map((l: any) => l?.returnWindowDays).filter((v: any) => typeof v === "number") as number[];
    return vals.length ? Math.max(...vals) : 7;
  })();
  const returnWindowExpired = swap.status === "completed" && swap.completedAt ? (Date.now() - new Date(swap.completedAt).getTime() > returnWindow * 86400000) : false;
  const canDispute = !swap.dispute && (
    ["pending", "accepted"].includes(swap.status) ||
    (swap.status === "completed" && !returnWindowExpired && returnWindow !== 0)
  );

  // --- Counter-offer (owner fires back on a pending swap) ---
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterNote, setCounterNote] = useState(swap.message ?? "");
  const [counterChatMsg, setCounterChatMsg] = useState("");
  const [counterMeetup, setCounterMeetup] = useState(Boolean(swap.meetup));
  const [counterPlace, setCounterPlace] = useState(swap.meetupPlace ?? "");
  const [counterLat, setCounterLat] = useState<number | null>(swap.meetupLat ?? null);
  const [counterLng, setCounterLng] = useState<number | null>(swap.meetupLng ?? null);
  const [counterTime, setCounterTime] = useState(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
  const [counterBusy, setCounterBusy] = useState(false);
  const [counterError, setCounterError] = useState("");
  const [counterBannerDismissed, setCounterBannerDismissed] = useState(false);

  // Keep counter form in sync with latest swap when opening — fixes stale data after an earlier counter.
  useEffect(() => {
    if (counterOpen) {
      setCounterNote(swap.message ?? "");
      setCounterChatMsg("");
      setCounterMeetup(Boolean(swap.meetup));
      setCounterPlace(swap.meetupPlace ?? "");
      setCounterLat(swap.meetupLat ?? null);
      setCounterLng(swap.meetupLng ?? null);
      setCounterTime(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
      setCounterError("");
    }
  }, [counterOpen, swap.message, swap.meetup, swap.meetupPlace, swap.meetupLat, swap.meetupLng, swap.meetupTime]);

  useEffect(() => {
    setCounterBannerDismissed(false);
  }, [swap.counteredAt]);

  // --- Meetup scheduling (either member, pending or accepted) ---
  const [meetupEditOpen, setMeetupEditOpen] = useState(false);
  const [meetupPlaceInput, setMeetupPlaceInput] = useState(swap.meetupPlace ?? "");
  const [meetupLatInput, setMeetupLatInput] = useState<number | null>(swap.meetupLat ?? null);
  const [meetupLngInput, setMeetupLngInput] = useState<number | null>(swap.meetupLng ?? null);
  const [meetupTimeInput, setMeetupTimeInput] = useState(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
  const [meetupBusy, setMeetupBusy] = useState(false);
  const [meetupError, setMeetupError] = useState("");
  const [mapOpen, setMapOpen] = useState(false);
  const [mapLayer, setMapLayer] = useState<"standard" | "satellite">("standard");
  const [meetupMobileOpen, setMeetupMobileOpen] = useState(false);

  // Keep meetup edit form synced when opening
  useEffect(() => {
    if (meetupEditOpen) {
      setMeetupPlaceInput(swap.meetupPlace ?? "");
      setMeetupLatInput(swap.meetupLat ?? null);
      setMeetupLngInput(swap.meetupLng ?? null);
      setMeetupTimeInput(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
      setMeetupError("");
    }
  }, [meetupEditOpen, swap.meetupPlace, swap.meetupLat, swap.meetupLng, swap.meetupTime]);

  // --- Composer image + typing ---
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [typingSent, setTypingSent] = useState(false);
  const typingDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const imagePreview = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : null), [imageFile]);
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // Re-render every minute so the pending-expiry countdown stays fresh.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const submitCounter = async () => {
    if (counterBusy) return;
    if (counterMeetup && !counterPlace.trim()) {
      setCounterError("Please enter a meetup place for a local meetup.");
      toast.error("Enter a meetup place to propose a local meetup.");
      return;
    }
    if (counterTime && Number.isNaN(new Date(counterTime).getTime())) {
      setCounterError("Invalid meetup time.");
      return;
    }
    if (counterChatMsg.trim().length > 1000) {
      setCounterError("Message is too long (max 1000 characters).");
      return;
    }
    setCounterBusy(true);
    setCounterError("");
    try {
      await counterSwap(swap.id, {
        message: counterNote.trim(),
        meetup: counterMeetup,
        meetupPlace: counterMeetup ? counterPlace.trim() : "",
        meetupLat: counterMeetup ? counterLat : null,
        meetupLng: counterMeetup ? counterLng : null,
        meetupTime: counterMeetup && counterTime ? new Date(counterTime).toISOString() : undefined,
        chatMessage: counterChatMsg.trim() || undefined,
      });
      setCounterOpen(false);
      toast.success("Counter-offer sent — the requester can now accept or decline.");
      void qc.invalidateQueries({ queryKey: ["swap", swap.id] });
      void qc.invalidateQueries({ queryKey: ["swap", swap.id, "messages"] });
      // scroll to newest after counter system message appears
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
      });
    } catch (e) {
      let msg = "Couldn't send a counter-offer right now.";
      if (e instanceof ApiError) msg = (e.body?.error as string) || e.message || msg;
      else if (e instanceof Error) msg = e.message || msg;
      else if ((e as { body?: { error?: string } })?.body?.error) msg = (e as { body: { error: string } }).body.error;
      setCounterError(msg);
      toast.error(msg);
    } finally {
      setCounterBusy(false);
    }
  };

  const submitMeetup = async () => {
    if (meetupBusy) return;
    setMeetupBusy(true);
    setMeetupError("");
    try {
      await updateSwapMeetup(swap.id, {
        meetupPlace: meetupPlaceInput.trim(),
        meetupLat: meetupLatInput,
        meetupLng: meetupLngInput,
        meetupTime: meetupTimeInput ? new Date(meetupTimeInput).toISOString() : undefined,
      });
      setMeetupEditOpen(false);
      toast.success("Meetup details updated.");
      void qc.invalidateQueries({ queryKey: ["swap", swap.id] });
      void qc.invalidateQueries({ queryKey: ["swap", swap.id, "messages"] });
    } catch (e) {
      const msg = (e as { body?: { error?: string } })?.body?.error ?? (e instanceof Error ? e.message : "Couldn't update the meetup right now.");
      setMeetupError(msg);
      toast.error(msg);
    } finally {
      setMeetupBusy(false);
    }
  };

  const onCompose = (value: string) => {
    setDraft(value);
    if (!apiEnabled) return;
    if (typingDebounce.current) clearTimeout(typingDebounce.current);
    if (value && !typingSent) {
      sendTyping(swap.id, swap.counterpartyId, true);
      setTypingSent(true);
    }
    typingDebounce.current = setTimeout(() => {
      if (typingSent) {
        sendTyping(swap.id, swap.counterpartyId, false);
        setTypingSent(false);
      }
    }, 2000);
  };

  const submitDispute = async () => {
    if (disputeBusy) return;
    setDisputeBusy(true);
    setDisputeError("");
    try {
      const { dispute } = await openSwapDispute(swap.id, { reason: disputeReason, description: disputeDesc.trim() });
      if (disputeFiles.length > 0) {
        await uploadDisputeEvidence(swap.id, dispute.id, disputeFiles).catch(() => {});
      }
      setDisputeOpen(false);
      setDisputeDesc("");
      setDisputeFiles([]);
      toast.success("Dispute opened — a moderator will review the thread shortly.");
      void qc.invalidateQueries({ queryKey: ["swap", swap.id] });
      void qc.invalidateQueries({ queryKey: ["swap", swap.id, "disputes"] });
    } catch (e) {
      const msg = (e as { body?: { error?: string } })?.body?.error ?? (e instanceof Error ? e.message : "Couldn't open a dispute right now.");
      setDisputeError(msg);
      toast.error(msg);
    } finally {
      setDisputeBusy(false);
    }
  };

  const confirmReceipt = async () => {
    if (receiptBusy) return;
    setReceiptBusy(true);
    try {
      await confirmSwapReceipt(swap.id);
      toast.success("Receipt confirmed — owner can now mark the swap as completed.");
      await qc.invalidateQueries({ queryKey: ["swap", swap.id] });
      await qc.invalidateQueries({ queryKey: ["swap", swap.id, "messages"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't confirm receipt. Please try again.");
    } finally {
      setReceiptBusy(false);
    }
  };

  const busy = (s: SwapStatus) => statusBusy === s;
  let actions: ReactNode = null;
  let actionsLabel = "";
  if (swap.status === "pending") {
    if (swap.direction === "incoming") {
      actionsLabel = "Swap request waiting — respond";
      actions = (
        <div className="flex gap-2 items-center max-md:grid max-md:grid-cols-3 max-md:gap-2 max-md:w-full">
          <button
            onClick={() => changeStatus("accepted")}
            disabled={Boolean(statusBusy)}
            aria-busy={busy("accepted")}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2.5 text-sm min-h-11 font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-md active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 max-md:justify-center max-md:rounded-xl max-md:min-h-12 max-md:px-2 max-md:text-xs max-md:font-black"
          >
            {busy("accepted") ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Accept
          </button>
          <button
            onClick={() => setCounterOpen(true)}
            disabled={Boolean(statusBusy)}
            className="group relative inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-2.5 text-sm min-h-11 font-bold text-brand shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand/10 hover:border-brand/40 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 lg:min-w-[150px] lg:pr-12 max-md:justify-center max-md:rounded-xl max-md:min-h-12 max-md:px-2 max-md:py-3 max-md:pr-10 max-md:text-xs max-md:gap-2"
          >
            <Handshake className="h-3.5 w-3.5" /> Counter
            <span className="pointer-events-none absolute right-11 top-1/2 h-4 w-px -translate-y-1/2 bg-brand/15 max-md:hidden" aria-hidden />
            <span
              className="absolute right-1.5 top-1/2 -translate-y-1/2 max-md:right-1.5"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
            >
              <HelpTooltip
                label="What does Counter do?"
                text="Counter lets you propose different terms instead of just accepting — edit your note or switch to a local meetup. The requester can then accept, decline or counter again. Each counter restarts the 7-day window."
                side="bottom"
                align="center"
              />
            </span>
          </button>
          <button
            onClick={() => changeStatus("declined")}
            disabled={Boolean(statusBusy)}
            aria-busy={busy("declined")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2.5 text-sm min-h-11 font-bold text-rose-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-rose-100 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 max-md:justify-center max-md:rounded-xl max-md:min-h-12 max-md:px-2 max-md:text-xs"
          >
            {busy("declined") ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Decline
          </button>
        </div>
      );
    } else {
      actionsLabel = "Pending the owner's reply — you can counter";
      actions = (
        <div className="flex gap-2 items-center max-md:grid max-md:grid-cols-2 max-md:gap-2 max-md:w-full">
          <button
            onClick={() => setCounterOpen(true)}
            disabled={Boolean(statusBusy)}
            className="group relative inline-flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3.5 py-2.5 text-sm min-h-11 font-bold text-brand shadow-sm transition-all hover:-translate-y-0.5 hover:bg-brand/10 hover:border-brand/40 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 lg:min-w-[150px] lg:pr-12 max-md:justify-center max-md:rounded-xl max-md:min-h-12 max-md:py-3 max-md:pr-10 max-md:text-xs max-md:gap-2"
          >
            <Handshake className="h-3.5 w-3.5" /> Counter
            <span className="pointer-events-none absolute right-11 top-1/2 h-4 w-px -translate-y-1/2 bg-brand/15 max-md:hidden" aria-hidden />
            <span
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
            >
              <HelpTooltip
                label="What does Counter do?"
                text="Propose new terms for this swap — edit your note or switch to a local meetup. The other person can then accept or decline. Each counter restarts the 7-day window."
                side="bottom"
                align="center"
              />
            </span>
          </button>
          <button
            onClick={() => changeStatus("cancelled")}
            disabled={Boolean(statusBusy)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-4 py-2.5 text-sm min-h-11 font-bold text-foreground/70 transition-colors hover:bg-muted disabled:opacity-60 max-md:justify-center max-md:rounded-xl max-md:min-h-12 max-md:text-xs"
          >
            {busy("cancelled") && <Loader2 className="h-3 w-3 animate-spin" />} Cancel
          </button>
        </div>
      );
    }
  } else if (swap.status === "accepted") {
    // Completion requires the requester to confirm they received the item
    // (that's the proof of delivery) and, for shipping swaps, the owner to
    // have shared a tracking number. Neither party can complete unilaterally.
    const receiptConfirmed = Boolean(swap.receiptConfirmedAt);
    const shipped = (swap.meetup && Boolean(swap.meetupPlace && String(swap.meetupPlace).trim())) || Boolean(swap.trackingNumber);
    const isRequester = swap.direction === "outgoing";
    if (!receiptConfirmed && isRequester) {
      actionsLabel = "Received the item?";
      actions = (
        <button
          onClick={() => void confirmReceipt()}
          disabled={receiptBusy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm min-h-11 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {receiptBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
          I received it
        </button>
      );
    } else if (!receiptConfirmed) {
      actionsLabel = "Waiting for the recipient";
      actions = (
        <div className="inline-flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm min-h-11 font-semibold text-sky-700">
          <PackageCheck className="h-3.5 w-3.5" /> Awaiting confirmation — the swap completes once the recipient confirms the item arrived
        </div>
      );
    } else if (!shipped) {
      actionsLabel = "Recipient confirmed receipt";
      actions = (
        <div className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm min-h-11 font-semibold text-amber-800">
          <Truck className="h-3.5 w-3.5" /> Recipient confirmed — add a tracking number to complete this swap
        </div>
      );
    } else {
      actionsLabel = "Accepted — confirm the swap";
      actions = (
        <button
          onClick={() => changeStatus("completed")}
          disabled={Boolean(statusBusy)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2.5 text-sm min-h-11 font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {busy("completed") && <Loader2 className="h-3 w-3 animate-spin" />} Mark completed
        </button>
      );
    }
  }

  // Insert a subtle day divider whenever the date changes.
  const timeline = useMemo(() => {
    const out: (SwapMessage | { type: "day"; label: string })[] = [];
    let lastDay = "";
    const today = new Date().toDateString();
    for (const m of allMessages) {
      const d = new Date(m.createdAt);
      const day = d.toDateString();
      if (day !== lastDay) {
        lastDay = day;
        const label =
          day === today
            ? "Today"
            : d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
        out.push({ type: "day", label });
      }
      out.push(m);
    }
    return out;
  }, [allMessages]);

  const standardMapSrc = meetupMapEmbed(swap);
  const coords = meetupCoords(swap);
  const satelliteHtml = coords ? satelliteMapHtml(coords.lat, coords.lng) : null;
  const hasAnyMap = Boolean(standardMapSrc || satelliteHtml);
  const showSideMap = Boolean(swap.meetup && hasAnyMap && mapOpen);

  return (
    <div className={cn("mx-auto flex h-full w-full flex-col bg-background transition-all duration-500 ease-in-out sm:px-4 sm:py-4", showSideMap ? "max-w-[1780px]" : "max-w-[1280px]")}>
      <div className={cn("flex h-full min-h-0 flex-1 transition-all duration-500 ease-in-out gap-0 flex-col lg:flex-row lg:gap-4")}>
        {/* Desktop persistent sidebar — swap details/actions live here, in the blank space beside the chat, instead of stacked above it. Uses the same content as the mobile/tablet flow below. */}
        <div className="hidden lg:flex lg:w-[340px] xl:w-[380px] lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:overflow-x-hidden lg:rounded-2xl lg:border lg:border-border lg:bg-card/40 lg:shadow-sm">
        {/* Swap items rail — mobile ultra-compact */}
        {listings.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/40 px-3 py-2 sm:px-4 max-md:px-3 max-md:py-2 max-md:gap-2 max-md:bg-muted/20 max-md:scrollbar-none max-md:snap-x">
            <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-foreground/45 max-md:text-[10px]">Swap</span>
            <Link
              to="/listing/$id"
              params={{ id: listings[0].id }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background p-1 pr-2.5 transition-colors hover:border-brand/40 max-md:gap-1 max-md:p-0.5 max-md:pr-2 max-md:rounded-md"
            >
              <img src={listings[0].images[0]} alt={listings[0].title} className="h-8 w-8 rounded-md object-cover max-md:h-7 max-md:w-7 max-md:rounded-md" />
              <span className="max-w-[8rem] truncate text-xs font-semibold max-md:max-w-[5.5rem] max-md:text-[11px]">{listings[0].title}</span>
            </Link>
            <ArrowRight className="h-4 w-4 shrink-0 text-foreground/40 max-md:h-3 max-md:w-3" />
            {bundleListings.length ? (
              <div className="flex items-center gap-1.5 max-md:gap-1">
                {bundleListings.map((b) => (
                  <Link
                    key={b.id}
                    to="/listing/$id"
                    params={{ id: b.id }}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background p-1 pr-2.5 transition-colors hover:border-brand/40 max-md:gap-1 max-md:p-0.5 max-md:pr-2 max-md:rounded-md"
                    title={`${b.title} · ${b.value} cr`}
                  >
                    <img src={b.images[0]} alt={b.title} className="h-8 w-8 rounded-md object-cover max-md:h-7 max-md:w-7 max-md:rounded-md" />
                    <span className="max-w-[6rem] truncate text-xs font-semibold max-md:max-w-[4.5rem] max-md:text-[11px]">{b.title}</span>
                    <span className="text-xs font-bold text-foreground/50 max-md:text-[10px]">{b.value}cr</span>
                  </Link>
                ))}
                {bundleListings.length > 1 && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-black text-white max-md:px-1.5 max-md:text-[10px]">{bundleListings.length}→1 bundle</span>
                )}
              </div>
            ) : (
              <span className="shrink-0 text-xs text-foreground/50 max-md:text-[11px]">…and a pick from you</span>
            )}
          </div>
        )}

        {/* Shipping address — saved addresses, no re-typing */}
        {swap.shipping && (swap as any).shippingAddress?.line1 && (
          <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/40 px-3 py-2 text-xs sm:px-4">
            <Truck className="h-3.5 w-3.5 text-sky-600" />
            <span className="font-bold text-sky-800">Ship to:</span>
            <span className="text-sky-900 truncate">
              {(swap as any).shippingAddress.name ? `${(swap as any).shippingAddress.name} · ` : ""}
              {(swap as any).shippingAddress.line1}
              {(swap as any).shippingAddress.line2 ? `, ${(swap as any).shippingAddress.line2}` : ""} · {(swap as any).shippingAddress.city}, {(swap as any).shippingAddress.postal} · {(swap as any).shippingAddress.country}
            </span>
            {(swap as any).shippingAddress.label && <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white">{(swap as any).shippingAddress.label}</span>}
          </div>
        )}

        {/* Accepted summary — what's locked in, credits and how the exchange happens */}
        {swap.status === "accepted" && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-emerald-100 bg-emerald-50/40 px-3 py-2 text-xs text-emerald-900 sm:px-4">
            <span className="font-black uppercase tracking-wide text-emerald-700">Locked in</span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <img src={swap.requestedListing?.images[0]} alt="" className="h-4 w-4 rounded object-cover" />
              {swap.requestedListing?.title ?? "your item"}
            </span>
            <ArrowRight className="h-3 w-3 text-foreground/40" />
            {bundleListings.length ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                {bundleListings.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1">
                    <img src={b.images[0]} alt="" className="h-4 w-4 rounded object-cover" />
                    {b.title}
                  </span>
                ))}
                <span className="text-xs text-emerald-700/60">({bundleListings.length} items)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold">
                <img src={swap.offeredListing?.images[0]} alt="" className="h-4 w-4 rounded object-cover" />
                {swap.offeredListing?.title ?? "their pick"}
              </span>
            )}
            {netCredits(swap) > 0 && (
              <span className="rounded-full bg-emerald-600 px-2.5 py-2 text-sm min-h-9 font-bold text-white">
                + {netCredits(swap)} credits
              </span>
            )}
            <span className="text-emerald-800/70">
              · {swap.meetup ? `meetup${swap.meetupPlace ? ` at ${swap.meetupPlace}` : ""}` : "shipping"}
            </span>
          </div>
        )}

        {/* Local meetup — PC unchanged, mobile as toggle button */}
        {swap.meetup && (
          <>
            {/* PC — original panel unchanged, hidden on mobile */}
            <div className="hidden lg:block border-b border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white">
                  <MapPin className="h-3 w-3" /> Local meetup
                </span>
                {swap.meetupPlace && <span className="text-xs font-semibold text-emerald-900">{swap.meetupPlace}</span>}
                {swap.meetupTime && (
                  <span className="text-xs font-semibold text-emerald-900/80">
                    {new Date(swap.meetupTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {hasAnyMap && (
                    <button
                      onClick={() => setMapOpen((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                      aria-expanded={mapOpen}
                    >
                      <MapPin className="h-3 w-3" /> {mapOpen ? "Hide map" : "Show map"}
                    </button>
                  )}
                  {swap.meetupPlace && !meetupMapEmbed(swap) && (
                    <div className="hidden sm:flex items-center gap-1">
                      <a
                        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(swap.meetupPlace)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                      >
                        <MapPin className="h-3 w-3" /> OSM
                      </a>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                      >
                        <MapPin className="h-3 w-3" /> Google
                      </a>
                    </div>
                  )}
                  {(swap.status === "pending" || swap.status === "accepted") && (
                    <button
                      onClick={() => {
                        setMeetupPlaceInput(swap.meetupPlace ?? "");
                        setMeetupTimeInput(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
                        setMeetupEditOpen(true);
                      }}
                      disabled={meetupBusy}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      <Pencil className="h-3 w-3" /> {swap.meetupPlace || swap.meetupTime ? "Edit" : "Schedule"}
                    </button>
                  )}
                </div>
              </div>
              {swap.meetupPlace && !hasAnyMap && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-emerald-900/70">View:</span>
                  <a
                    href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(swap.meetupPlace)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                  >
                    Open in OSM
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                  >
                    Open in Google Maps
                  </a>
                  <span className="text-xs text-emerald-900/60 sm:hidden">(place name only — add precise listing location for embedded map)</span>
                </div>
              )}
            </div>
            {/* Mobile — toggle button, best place under swap rail */}
            <div className="lg:hidden border-b border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
              <button
                onClick={() => setMeetupMobileOpen((v) => !v)}
                aria-expanded={meetupMobileOpen}
                aria-label={meetupMobileOpen ? "Hide meetup details" : "Show meetup details"}
                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors active:bg-emerald-100/50"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col items-start">
                    <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-700">
                      Local meetup
                      <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] leading-none text-white">Tap to {meetupMobileOpen ? "hide" : "view"}</span>
                    </span>
                    <span className="max-w-[58vw] truncate text-xs font-bold text-emerald-900">{swap.meetupPlace || "Meetup point"}</span>
                    {swap.meetupTime && (
                      <span className="text-[11px] font-medium text-emerald-700/70">
                        {new Date(swap.meetupTime).toLocaleDateString([], { month: "short", day: "numeric" })} • {new Date(swap.meetupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-700 shadow-sm border border-emerald-200 transition-transform duration-300 ${meetupMobileOpen ? "rotate-180" : ""}`}>
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </span>
              </button>
              <div className={`grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${meetupMobileOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 pt-1 space-y-2.5">
                    <div className="rounded-2xl bg-white p-3 shadow-sm border border-emerald-100">
                      <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-900">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {swap.meetupPlace}
                      </p>
                      {swap.meetupTime && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700/70">
                          <Calendar className="h-3 w-3" /> {new Date(swap.meetupTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {hasAnyMap && (
                          <button
                            onClick={() => setMapOpen((v) => !v)}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm"
                            aria-expanded={mapOpen}
                          >
                            <MapPin className="h-3 w-3" /> {mapOpen ? "Hide map" : "Show map"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setMeetupPlaceInput(swap.meetupPlace ?? "");
                            setMeetupTimeInput(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
                            setMeetupEditOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        {swap.meetupPlace && !hasAnyMap && (
                          <>
                            <a
                              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(swap.meetupPlace)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200"
                            >
                              OSM
                            </a>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200"
                            >
                              Google
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    {showSideMap && (
                      <div className="overflow-hidden rounded-xl border border-emerald-200">
                        <div className="flex items-center justify-between bg-white px-2 py-1.5">
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-800">
                            <Layers className="h-3 w-3" /> Map view
                          </span>
                          <div className="flex rounded-full bg-muted p-0.5">
                            <button
                              type="button"
                              onClick={() => setMapLayer("standard")}
                              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors", mapLayer === "standard" ? "bg-emerald-600 text-white shadow-sm" : "text-foreground/60 hover:text-foreground")}
                            >
                              <MapIcon className="h-3 w-3" /> Map
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLayer("satellite")}
                              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors", mapLayer === "satellite" ? "bg-emerald-600 text-white shadow-sm" : "text-foreground/60 hover:text-foreground")}
                            >
                              <Satellite className="h-3 w-3" /> Satellite
                            </button>
                          </div>
                        </div>
                        {mapLayer === "satellite" && satelliteHtml ? (
                          <iframe
                            title={`Meetup satellite — ${swap.meetupPlace || "local spot"}`}
                            srcDoc={satelliteHtml}
                            className="h-40 w-full border-t border-emerald-200"
                            loading="lazy"
                          />
                        ) : standardMapSrc ? (
                          <iframe
                            title={`Meetup map — ${swap.meetupPlace || "local spot"}`}
                            src={standardMapSrc}
                            className="h-40 w-full border-t border-emerald-200"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Shipping & tracking panel */}
        {swap.shipping && (
          <ShippingPanel
            swap={swap}
            isOwner={swap.direction === "incoming"}
            onUpdated={() => {
              void qc.invalidateQueries({ queryKey: ["swap", swap.id] });
            }}
          />
        )}

        {/* Action bar — mobile compact */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-cream/50 px-3 py-2 sm:px-4 max-md:px-3 max-md:py-1.5 max-md:gap-1.5">
            <span className="text-xs font-medium text-foreground/55 max-md:text-[11px] max-md:leading-tight">{actionsLabel}</span>
            <div className="ml-auto flex flex-wrap gap-2 max-md:gap-1.5 max-md:w-full max-md:ml-0 max-md:mt-1">{actions}</div>
          </div>
        )}

        {/* Counter-offer banner — mobile ultra-compact */}
        {swap.counteredAt && swap.status === "pending" && !counterBannerDismissed && (
          <div className="flex items-start gap-2.5 border-b border-brand/20 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-3 py-2 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-1.5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm max-md:h-5 max-md:w-5">
              <Handshake className="h-3 w-3 max-md:h-3 max-md:w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-brand max-md:text-[11px] max-md:gap-1">
                Counter-offer
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-foreground max-md:px-1 max-md:text-[10px]">updated</span>
                <span className="hidden sm:inline font-normal text-foreground/60">
                  · {new Date(swap.counteredAt).toLocaleDateString([], { month: "short", day: "numeric" })} {new Date(swap.counteredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-foreground/70 max-md:text-[11px] max-md:leading-tight max-md:line-clamp-1">
                {swap.direction === "incoming"
                  ? `You countered — ${swap.counterparty.name} can accept or decline.`
                  : `${swap.counterparty.name} countered — review the new note/meetup above.`}
              </p>
            </div>
            <button
              onClick={() => setCounterBannerDismissed(true)}
              aria-label="Dismiss counter banner"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foreground/40 hover:bg-black/5 hover:text-foreground max-md:h-6 max-md:w-6"
            >
              <X className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" />
            </button>
          </div>
        )}

        {/* Terminal status banners — make accept/decline/cancel/completed unmistakable */}
        {swap.status === "declined" && (
          <div className="flex items-start gap-2.5 border-b border-rose-200 bg-rose-50 px-3 py-3 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-600 text-white shadow-sm max-md:h-7 max-md:w-7">
              <XCircle className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-rose-800 max-md:text-xs">
                {swap.direction === "incoming" ? "You declined this swap" : `${swap.counterparty.name} declined your offer`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-rose-700/80 max-md:text-[11px] max-md:leading-tight">
                {swap.direction === "incoming"
                  ? "The requester has been notified. No credits were moved. They can propose again with a new swap if they'd like."
                  : "Your request was declined — no credits were moved. You can browse similar items or send a new proposal with different terms."}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-rose-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8">Declined</span>
          </div>
        )}

        {swap.status === "cancelled" && (
          <div className="flex items-start gap-2.5 border-b border-foreground/10 bg-muted px-3 py-3 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background shadow-sm max-md:h-7 max-md:w-7">
              <X className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground max-md:text-xs">Swap cancelled</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/60 max-md:text-[11px] max-md:leading-tight">
                This request was withdrawn before a response. No credits were moved. Feel free to propose again when you're ready.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-foreground px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-background max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8">Cancelled</span>
          </div>
        )}

        {swap.status === "completed" && (
          <div className="flex items-start gap-2.5 border-b border-emerald-200 bg-emerald-50 px-3 py-3 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm max-md:h-7 max-md:w-7">
              <Award className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-emerald-800 max-md:text-xs">Swap completed — nice work!</p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-700/80 max-md:text-[11px] max-md:leading-tight">
                Both sides confirmed the exchange. Credits have been settled and the items are marked as swapped. Leave a review from your dashboard.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8">Completed</span>
          </div>
        )}

        {swap.status === "accepted" && (
          <div className="flex items-start gap-2.5 border-b border-emerald-200 bg-emerald-50/80 px-3 py-2.5 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm max-md:h-6 max-md:w-6">
              <CheckCheck className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-emerald-800 max-md:text-[11px]">
                {swap.direction === "incoming" ? "You accepted this swap — locked in!" : `${swap.counterparty.name} accepted your offer!`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-700/80 max-md:text-[11px] max-md:leading-tight">
                The exchange is now binding. Arrange shipping or meet up — the swap will complete once the recipient confirms receipt and tracking is added.
              </p>
            </div>
          </div>
        )}

        {/* Dispute banner — mobile compact */}
        {swap.dispute && (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4 max-md:px-3 max-md:py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 text-xs text-amber-800">
                <span className="font-bold">{swap.dispute.status === "resolved" ? "Dispute resolved" : "Dispute open"}</span>
                <span className="mx-1.5 text-amber-500">·</span>
                <span className="font-medium">{swap.dispute.reason}</span>
                {swap.dispute.description && <span className="block truncate text-amber-700/80">“{swap.dispute.description}”</span>}
              </p>
              <span className={`shrink-0 rounded-full px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white ${swap.dispute.status === "resolved" ? "bg-emerald-600" : "bg-amber-600"}`}>
                {swap.dispute.status}
              </span>
            </div>

            {disputeDetail?.evidence && disputeDetail.evidence.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {disputeDetail.evidence.map((ev, i) => (
                  <a
                    key={ev.publicId || i}
                    href={ev.url ?? "#"}
                    target={ev.url ? "_blank" : undefined}
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-amber-200 bg-white"
                    aria-label={`Dispute evidence ${i + 1}`}
                  >
                    <img src={ev.url ?? ""} alt={`Dispute evidence ${i + 1}`} className="h-14 w-14 object-cover" />
                  </a>
                ))}
              </div>
            )}

            {disputeDetail?.timeline && disputeDetail.timeline.length > 0 && (
              <ol className="mt-2 space-y-1">
                {disputeDetail.timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-800/80">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="min-w-0">
                      <span className="font-bold capitalize">{t.actor}</span>{" "}
                      <span className="text-amber-800/70">{t.note || t.action}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {swap.dispute.status === "resolved" && (swap.dispute.resolutionNote || swap.dispute.outcome) && (
              <p className="mt-2 rounded-lg bg-emerald-100/70 px-3 py-2.5 text-sm min-h-11 text-emerald-900">
                <span className="font-bold">Moderator decision:</span>{" "}
                {swap.dispute.outcome === "refund_requester"
                  ? "credits refunded to the requester"
                  : swap.dispute.outcome === "release_owner"
                    ? "credits released to the owner"
                    : "no credits moved"}
                {swap.dispute.resolutionNote ? ` — “${swap.dispute.resolutionNote}”` : ""}
              </p>
            )}
          </div>
        )}

        {swap.dispute && disputeDetail && (
          <DisputeChatPanel swapId={swap.id} disputeId={disputeDetail.id} isOpen={swap.dispute.status === "open"} />
        )}

        {/* Return policy badge — mobile compact */}
        {swap.status === "completed" || swap.status === "accepted" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2.5 text-sm min-h-11 sm:px-4 max-md:px-3 max-md:py-2 max-md:gap-1.5 max-md:text-xs max-md:min-h-9">
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background px-2 py-0.5 font-semibold text-foreground/60">
              <Shield className="h-3 w-3" /> Returns: {returnWindow === 0 ? "No returns" : `${returnWindow} days`}
            </span>
            {swap.completedAt && returnWindow !== 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-sm min-h-9 font-bold ${returnWindowExpired ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                {returnWindowExpired ? `Window expired` : `Disputes open for ${Math.ceil((new Date(swap.completedAt).getTime() + returnWindow*86400000 - Date.now())/86400000)}d`}
              </span>
            )}
            {bundleListings[0]?.returnPolicy && <span className="text-foreground/50 truncate" title={bundleListings[0].returnPolicy}>{bundleListings[0].returnPolicy}</span>}
          </div>
        ) : null}
        {/* Open a dispute — mobile compact */}
        {canDispute ? (
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 sm:px-4 max-md:px-3 max-md:py-2 max-md:gap-1.5">
            <p className="text-xs text-foreground/60 lg:min-w-0 lg:flex-1 max-md:text-[11px] max-md:leading-tight">Something go wrong? {swap.status === "completed" ? `You have ${returnWindow} days to dispute · ` : ""}Open a case with photo evidence.</p>
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 lg:ml-2">
              <button
                onClick={() => setDisputeOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-sm font-bold min-h-9 text-amber-700 transition-colors hover:bg-amber-100 max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8 max-md:gap-1"
              >
                <Scale className="h-3.5 w-3.5" /> Open a dispute
              </button>
              <HelpTooltip
                label="What does Open a dispute do?"
                text={`Opens a case with Swapt moderators. Include what went wrong and photo evidence. Return window: ${returnWindow === 0 ? "No returns" : `${returnWindow} days`} — moderators decide whether to refund or release the escrowed credits.`}
                side="top"
                align="end"
              />
            </span>
          </div>
        ) : swap.status === "completed" && !swap.dispute ? (
          <div className="border-b border-border bg-rose-50/60 px-3 py-2.5 text-sm min-h-11 text-rose-700 sm:px-4">
            {returnWindow === 0 ? "No returns on this listing — disputes cannot be opened after completion." : returnWindowExpired ? `Return window expired (${returnWindow} days) — disputes are closed.` : null}
          </div>
        ) : null}
        </div>

        <div className={cn("flex min-h-0 flex-col overflow-hidden bg-card/40 transition-all duration-500 ease-in-out sm:rounded-2xl sm:border sm:border-border sm:shadow-sm flex-1 lg:min-w-0")}>
        {/* Header — mobile compact premium, desktop unchanged */}
        <header className="shrink-0 border-b border-border bg-card px-3 pb-2 pt-2.5 sm:px-4 max-md:px-3 max-md:py-2 max-md:pb-1.5 max-md:gap-1 max-md:bg-card/95 max-md:backdrop-blur-xl">
          <div className="flex items-center gap-2 sm:gap-3 max-md:gap-2">
            <Link
              to="/dashboard"
              aria-label="Back to dashboard"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:bg-muted max-md:h-9 max-md:w-9"
            >
              <ArrowLeft className="h-5 w-5 max-md:h-4 max-md:w-4" />
            </Link>
            <Link
              to="/seller/$username"
              params={{ username: swap.counterparty.username }}
              className="relative shrink-0 max-md:scale-90 max-md:origin-center"
              aria-label={`View ${swap.counterparty.name}'s profile`}
            >
              <Avatar url={swap.counterparty.avatarUrl} name={swap.counterparty.name} size={40} />
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                to="/seller/$username"
                params={{ username: swap.counterparty.username }}
                className="block truncate text-[15px] font-black tracking-tight transition-colors hover:text-brand"
              >
                {swap.counterparty.name}
              </Link>
              <Link
                to="/seller/$username"
                params={{ username: swap.counterparty.username }}
                className="block truncate text-xs text-foreground/50 transition-colors hover:text-brand"
              >
                @{swap.counterparty.username}
              </Link>
            </div>
            <Link
              to="/seller/$username"
              params={{ username: swap.counterparty.username }}
              title={`View ${swap.counterparty.name}'s profile`}
              aria-label={`View ${swap.counterparty.name}'s profile`}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-border text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand active:bg-muted max-md:h-9 max-md:w-9"
            >
              <User className="h-[18px] w-[18px] max-md:h-4 max-md:w-4" />
            </Link>
          </div>

          {/* Row 2 — mobile ultra-compact */}
          <>
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto scrollbar-none max-md:-mx-3 max-md:px-3 max-md:scroll-px-3 max-md:snap-x max-md:gap-1 max-md:mt-1.5">
              <span className={`inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold max-md:h-7 max-md:px-2.5 max-md:text-[11px] max-md:gap-1 ${statusTone(swap.status)}`}>
                {STATUS_LABEL[swap.status] ?? swap.status}
              </span>
              {swap.status === "pending" && swap.expiresAt && (
                <span
                  title="This request auto-cancels if it stays unanswered"
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-amber-100 px-3 text-xs font-bold text-amber-700 max-md:h-7 max-md:px-2.5 max-md:text-[11px] max-md:gap-1"
                >
                  <Clock className="h-3 w-3" />
                  {expiryLabel(swap.expiresAt, nowTick)}
                </span>
              )}
              {swap.escrow && (
                <span
                  title={swap.escrow.status === "pending" ? `${swap.escrow.amount} credits held in escrow for this swap` : "Escrow settled"}
                  className="inline-flex h-8 shrink-0 items-center rounded-full bg-violet-100 px-3 text-xs font-bold text-violet-700 max-md:h-7 max-md:px-2.5 max-md:text-[11px]"
                >
                  {swap.escrow.status === "pending" ? `Escrow · ${swap.escrow.amount}` : "Escrow settled"}
                </span>
              )}
              {swap.meetup && (
                <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 text-xs font-bold text-emerald-700 max-md:h-7 max-md:px-2.5 max-md:text-[11px] max-md:gap-1">
                  <MapPin className="h-3 w-3" /> Meetup
                </span>
              )}
              {swap.shipping && (
                <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-sky-100 px-3 text-xs font-bold text-sky-700 max-md:h-7 max-md:px-2.5 max-md:text-[11px] max-md:gap-1">
                  <Truck className="h-3 w-3" /> Shipping
                </span>
              )}
            </div>
          </>
        </header>

        {/* Mobile/tablet: swap details/actions stacked above chat, exactly as before. Desktop (lg+) uses the persistent sidebar instead — see above. */}
        <div className="lg:hidden">
        {/* Swap items rail — mobile ultra-compact */}
        {listings.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border bg-muted/40 px-3 py-2 sm:px-4 max-md:px-3 max-md:py-2 max-md:gap-2 max-md:bg-muted/20 max-md:scrollbar-none max-md:snap-x">
            <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-foreground/45 max-md:text-[10px]">Swap</span>
            <Link
              to="/listing/$id"
              params={{ id: listings[0].id }}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background p-1 pr-2.5 transition-colors hover:border-brand/40 max-md:gap-1 max-md:p-0.5 max-md:pr-2 max-md:rounded-md"
            >
              <img src={listings[0].images[0]} alt={listings[0].title} className="h-8 w-8 rounded-md object-cover max-md:h-7 max-md:w-7 max-md:rounded-md" />
              <span className="max-w-[8rem] truncate text-xs font-semibold max-md:max-w-[5.5rem] max-md:text-[11px]">{listings[0].title}</span>
            </Link>
            <ArrowRight className="h-4 w-4 shrink-0 text-foreground/40 max-md:h-3 max-md:w-3" />
            {bundleListings.length ? (
              <div className="flex items-center gap-1.5 max-md:gap-1">
                {bundleListings.map((b) => (
                  <Link
                    key={b.id}
                    to="/listing/$id"
                    params={{ id: b.id }}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-background p-1 pr-2.5 transition-colors hover:border-brand/40 max-md:gap-1 max-md:p-0.5 max-md:pr-2 max-md:rounded-md"
                    title={`${b.title} · ${b.value} cr`}
                  >
                    <img src={b.images[0]} alt={b.title} className="h-8 w-8 rounded-md object-cover max-md:h-7 max-md:w-7 max-md:rounded-md" />
                    <span className="max-w-[6rem] truncate text-xs font-semibold max-md:max-w-[4.5rem] max-md:text-[11px]">{b.title}</span>
                    <span className="text-xs font-bold text-foreground/50 max-md:text-[10px]">{b.value}cr</span>
                  </Link>
                ))}
                {bundleListings.length > 1 && (
                  <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-black text-white max-md:px-1.5 max-md:text-[10px]">{bundleListings.length}→1 bundle</span>
                )}
              </div>
            ) : (
              <span className="shrink-0 text-xs text-foreground/50 max-md:text-[11px]">…and a pick from you</span>
            )}
          </div>
        )}

        {/* Shipping address — saved addresses, no re-typing */}
        {swap.shipping && (swap as any).shippingAddress?.line1 && (
          <div className="flex items-center gap-2 border-b border-sky-100 bg-sky-50/40 px-3 py-2 text-xs sm:px-4">
            <Truck className="h-3.5 w-3.5 text-sky-600" />
            <span className="font-bold text-sky-800">Ship to:</span>
            <span className="text-sky-900 truncate">
              {(swap as any).shippingAddress.name ? `${(swap as any).shippingAddress.name} · ` : ""}
              {(swap as any).shippingAddress.line1}
              {(swap as any).shippingAddress.line2 ? `, ${(swap as any).shippingAddress.line2}` : ""} · {(swap as any).shippingAddress.city}, {(swap as any).shippingAddress.postal} · {(swap as any).shippingAddress.country}
            </span>
            {(swap as any).shippingAddress.label && <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-bold text-white">{(swap as any).shippingAddress.label}</span>}
          </div>
        )}

        {/* Accepted summary — what's locked in, credits and how the exchange happens */}
        {swap.status === "accepted" && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-emerald-100 bg-emerald-50/40 px-3 py-2 text-xs text-emerald-900 sm:px-4">
            <span className="font-black uppercase tracking-wide text-emerald-700">Locked in</span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <img src={swap.requestedListing?.images[0]} alt="" className="h-4 w-4 rounded object-cover" />
              {swap.requestedListing?.title ?? "your item"}
            </span>
            <ArrowRight className="h-3 w-3 text-foreground/40" />
            {bundleListings.length ? (
              <span className="inline-flex items-center gap-1 font-semibold">
                {bundleListings.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1">
                    <img src={b.images[0]} alt="" className="h-4 w-4 rounded object-cover" />
                    {b.title}
                  </span>
                ))}
                <span className="text-xs text-emerald-700/60">({bundleListings.length} items)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-semibold">
                <img src={swap.offeredListing?.images[0]} alt="" className="h-4 w-4 rounded object-cover" />
                {swap.offeredListing?.title ?? "their pick"}
              </span>
            )}
            {netCredits(swap) > 0 && (
              <span className="rounded-full bg-emerald-600 px-2.5 py-2 text-sm min-h-9 font-bold text-white">
                + {netCredits(swap)} credits
              </span>
            )}
            <span className="text-emerald-800/70">
              · {swap.meetup ? `meetup${swap.meetupPlace ? ` at ${swap.meetupPlace}` : ""}` : "shipping"}
            </span>
          </div>
        )}

        {/* Local meetup — PC unchanged, mobile as toggle button */}
        {swap.meetup && (
          <>
            {/* PC — original panel unchanged, hidden on mobile */}
            <div className="hidden lg:block border-b border-emerald-200 bg-emerald-50/60 px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white">
                  <MapPin className="h-3 w-3" /> Local meetup
                </span>
                {swap.meetupPlace && <span className="text-xs font-semibold text-emerald-900">{swap.meetupPlace}</span>}
                {swap.meetupTime && (
                  <span className="text-xs font-semibold text-emerald-900/80">
                    {new Date(swap.meetupTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1.5">
                  {hasAnyMap && (
                    <button
                      onClick={() => setMapOpen((v) => !v)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                      aria-expanded={mapOpen}
                    >
                      <MapPin className="h-3 w-3" /> {mapOpen ? "Hide map" : "Show map"}
                    </button>
                  )}
                  {swap.meetupPlace && !meetupMapEmbed(swap) && (
                    <div className="hidden sm:flex items-center gap-1">
                      <a
                        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(swap.meetupPlace)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                      >
                        <MapPin className="h-3 w-3" /> OSM
                      </a>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                      >
                        <MapPin className="h-3 w-3" /> Google
                      </a>
                    </div>
                  )}
                  {(swap.status === "pending" || swap.status === "accepted") && (
                    <button
                      onClick={() => {
                        setMeetupPlaceInput(swap.meetupPlace ?? "");
                        setMeetupTimeInput(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
                        setMeetupEditOpen(true);
                      }}
                      disabled={meetupBusy}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 transition-colors hover:bg-emerald-100"
                    >
                      <Pencil className="h-3 w-3" /> {swap.meetupPlace || swap.meetupTime ? "Edit" : "Schedule"}
                    </button>
                  )}
                </div>
              </div>
              {swap.meetupPlace && !hasAnyMap && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-emerald-900/70">View:</span>
                  <a
                    href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(swap.meetupPlace)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                  >
                    Open in OSM
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-2 text-sm font-bold min-h-9 text-emerald-800 border border-emerald-200 hover:bg-emerald-100"
                  >
                    Open in Google Maps
                  </a>
                  <span className="text-xs text-emerald-900/60 sm:hidden">(place name only — add precise listing location for embedded map)</span>
                </div>
              )}
            </div>
            {/* Mobile — toggle button, best place under swap rail */}
            <div className="lg:hidden border-b border-emerald-200 bg-gradient-to-r from-emerald-50 to-white">
              <button
                onClick={() => setMeetupMobileOpen((v) => !v)}
                aria-expanded={meetupMobileOpen}
                aria-label={meetupMobileOpen ? "Hide meetup details" : "Show meetup details"}
                className="flex w-full items-center justify-between px-3 py-3 text-left transition-colors active:bg-emerald-100/50"
              >
                <span className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col items-start">
                    <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-emerald-700">
                      Local meetup
                      <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] leading-none text-white">Tap to {meetupMobileOpen ? "hide" : "view"}</span>
                    </span>
                    <span className="max-w-[58vw] truncate text-xs font-bold text-emerald-900">{swap.meetupPlace || "Meetup point"}</span>
                    {swap.meetupTime && (
                      <span className="text-[11px] font-medium text-emerald-700/70">
                        {new Date(swap.meetupTime).toLocaleDateString([], { month: "short", day: "numeric" })} • {new Date(swap.meetupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 place-items-center rounded-full bg-white text-emerald-700 shadow-sm border border-emerald-200 transition-transform duration-300 ${meetupMobileOpen ? "rotate-180" : ""}`}>
                    <ChevronDown className="h-4 w-4" />
                  </span>
                </span>
              </button>
              <div className={`grid transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${meetupMobileOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
                <div className="overflow-hidden">
                  <div className="px-3 pb-3 pt-1 space-y-2.5">
                    <div className="rounded-2xl bg-white p-3 shadow-sm border border-emerald-100">
                      <p className="flex items-start gap-1.5 text-xs font-semibold text-emerald-900">
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0" /> {swap.meetupPlace}
                      </p>
                      {swap.meetupTime && (
                        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-700/70">
                          <Calendar className="h-3 w-3" /> {new Date(swap.meetupTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {hasAnyMap && (
                          <button
                            onClick={() => setMapOpen((v) => !v)}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-sm"
                            aria-expanded={mapOpen}
                          >
                            <MapPin className="h-3 w-3" /> {mapOpen ? "Hide map" : "Show map"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setMeetupPlaceInput(swap.meetupPlace ?? "");
                            setMeetupTimeInput(swap.meetupTime ? swap.meetupTime.slice(0, 16) : "");
                            setMeetupEditOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                        {swap.meetupPlace && !hasAnyMap && (
                          <>
                            <a
                              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(swap.meetupPlace)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200"
                            >
                              OSM
                            </a>
                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-2 text-xs font-bold text-emerald-800 border border-emerald-200"
                            >
                              Google
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                    {showSideMap && (
                      <div className="overflow-hidden rounded-xl border border-emerald-200">
                        <div className="flex items-center justify-between bg-white px-2 py-1.5">
                          <span className="flex items-center gap-1 text-xs font-bold text-emerald-800">
                            <Layers className="h-3 w-3" /> Map view
                          </span>
                          <div className="flex rounded-full bg-muted p-0.5">
                            <button
                              type="button"
                              onClick={() => setMapLayer("standard")}
                              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors", mapLayer === "standard" ? "bg-emerald-600 text-white shadow-sm" : "text-foreground/60 hover:text-foreground")}
                            >
                              <MapIcon className="h-3 w-3" /> Map
                            </button>
                            <button
                              type="button"
                              onClick={() => setMapLayer("satellite")}
                              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold transition-colors", mapLayer === "satellite" ? "bg-emerald-600 text-white shadow-sm" : "text-foreground/60 hover:text-foreground")}
                            >
                              <Satellite className="h-3 w-3" /> Satellite
                            </button>
                          </div>
                        </div>
                        {mapLayer === "satellite" && satelliteHtml ? (
                          <iframe
                            title={`Meetup satellite — ${swap.meetupPlace || "local spot"}`}
                            srcDoc={satelliteHtml}
                            className="h-40 w-full border-t border-emerald-200"
                            loading="lazy"
                          />
                        ) : standardMapSrc ? (
                          <iframe
                            title={`Meetup map — ${swap.meetupPlace || "local spot"}`}
                            src={standardMapSrc}
                            className="h-40 w-full border-t border-emerald-200"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Shipping & tracking panel */}
        {swap.shipping && (
          <ShippingPanel
            swap={swap}
            isOwner={swap.direction === "incoming"}
            onUpdated={() => {
              void qc.invalidateQueries({ queryKey: ["swap", swap.id] });
            }}
          />
        )}

        {/* Action bar — mobile compact */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface-cream/50 px-3 py-2 sm:px-4 max-md:px-3 max-md:py-1.5 max-md:gap-1.5">
            <span className="text-xs font-medium text-foreground/55 max-md:text-[11px] max-md:leading-tight">{actionsLabel}</span>
            <div className="ml-auto flex flex-wrap gap-2 max-md:gap-1.5 max-md:w-full max-md:ml-0 max-md:mt-1">{actions}</div>
          </div>
        )}

        {/* Counter-offer banner — mobile ultra-compact */}
        {swap.counteredAt && swap.status === "pending" && !counterBannerDismissed && (
          <div className="flex items-start gap-2.5 border-b border-brand/20 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-3 py-2 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-1.5">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-brand-foreground shadow-sm max-md:h-5 max-md:w-5">
              <Handshake className="h-3 w-3 max-md:h-3 max-md:w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-brand max-md:text-[11px] max-md:gap-1">
                Counter-offer
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-foreground max-md:px-1 max-md:text-[10px]">updated</span>
                <span className="hidden sm:inline font-normal text-foreground/60">
                  · {new Date(swap.counteredAt).toLocaleDateString([], { month: "short", day: "numeric" })} {new Date(swap.counteredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-foreground/70 max-md:text-[11px] max-md:leading-tight max-md:line-clamp-1">
                {swap.direction === "incoming"
                  ? `You countered — ${swap.counterparty.name} can accept or decline.`
                  : `${swap.counterparty.name} countered — review the new note/meetup above.`}
              </p>
            </div>
            <button
              onClick={() => setCounterBannerDismissed(true)}
              aria-label="Dismiss counter banner"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-foreground/40 hover:bg-black/5 hover:text-foreground max-md:h-6 max-md:w-6"
            >
              <X className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" />
            </button>
          </div>
        )}

        {/* Terminal status banners — make accept/decline/cancel/completed unmistakable */}
        {swap.status === "declined" && (
          <div className="flex items-start gap-2.5 border-b border-rose-200 bg-rose-50 px-3 py-3 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-rose-600 text-white shadow-sm max-md:h-7 max-md:w-7">
              <XCircle className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-rose-800 max-md:text-xs">
                {swap.direction === "incoming" ? "You declined this swap" : `${swap.counterparty.name} declined your offer`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-rose-700/80 max-md:text-[11px] max-md:leading-tight">
                {swap.direction === "incoming"
                  ? "The requester has been notified. No credits were moved. They can propose again with a new swap if they'd like."
                  : "Your request was declined — no credits were moved. You can browse similar items or send a new proposal with different terms."}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-rose-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8">Declined</span>
          </div>
        )}

        {swap.status === "cancelled" && (
          <div className="flex items-start gap-2.5 border-b border-foreground/10 bg-muted px-3 py-3 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-foreground text-background shadow-sm max-md:h-7 max-md:w-7">
              <X className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground max-md:text-xs">Swap cancelled</p>
              <p className="mt-0.5 text-xs leading-relaxed text-foreground/60 max-md:text-[11px] max-md:leading-tight">
                This request was withdrawn before a response. No credits were moved. Feel free to propose again when you're ready.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-foreground px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-background max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8">Cancelled</span>
          </div>
        )}

        {swap.status === "completed" && (
          <div className="flex items-start gap-2.5 border-b border-emerald-200 bg-emerald-50 px-3 py-3 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm max-md:h-7 max-md:w-7">
              <Award className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-emerald-800 max-md:text-xs">Swap completed — nice work!</p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-700/80 max-md:text-[11px] max-md:leading-tight">
                Both sides confirmed the exchange. Credits have been settled and the items are marked as swapped. Leave a review from your dashboard.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-emerald-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8">Completed</span>
          </div>
        )}

        {swap.status === "accepted" && (
          <div className="flex items-start gap-2.5 border-b border-emerald-200 bg-emerald-50/80 px-3 py-2.5 sm:px-4 max-md:gap-2 max-md:px-3 max-md:py-2">
            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-600 text-white shadow-sm max-md:h-6 max-md:w-6">
              <CheckCheck className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-emerald-800 max-md:text-[11px]">
                {swap.direction === "incoming" ? "You accepted this swap — locked in!" : `${swap.counterparty.name} accepted your offer!`}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-emerald-700/80 max-md:text-[11px] max-md:leading-tight">
                The exchange is now binding. Arrange shipping or meet up — the swap will complete once the recipient confirms receipt and tracking is added.
              </p>
            </div>
          </div>
        )}

        {/* Dispute banner — mobile compact */}
        {swap.dispute && (
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 sm:px-4 max-md:px-3 max-md:py-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <p className="min-w-0 flex-1 text-xs text-amber-800">
                <span className="font-bold">{swap.dispute.status === "resolved" ? "Dispute resolved" : "Dispute open"}</span>
                <span className="mx-1.5 text-amber-500">·</span>
                <span className="font-medium">{swap.dispute.reason}</span>
                {swap.dispute.description && <span className="block truncate text-amber-700/80">“{swap.dispute.description}”</span>}
              </p>
              <span className={`shrink-0 rounded-full px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white ${swap.dispute.status === "resolved" ? "bg-emerald-600" : "bg-amber-600"}`}>
                {swap.dispute.status}
              </span>
            </div>

            {disputeDetail?.evidence && disputeDetail.evidence.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {disputeDetail.evidence.map((ev, i) => (
                  <a
                    key={ev.publicId || i}
                    href={ev.url ?? "#"}
                    target={ev.url ? "_blank" : undefined}
                    rel="noreferrer"
                    className="overflow-hidden rounded-lg border border-amber-200 bg-white"
                    aria-label={`Dispute evidence ${i + 1}`}
                  >
                    <img src={ev.url ?? ""} alt={`Dispute evidence ${i + 1}`} className="h-14 w-14 object-cover" />
                  </a>
                ))}
              </div>
            )}

            {disputeDetail?.timeline && disputeDetail.timeline.length > 0 && (
              <ol className="mt-2 space-y-1">
                {disputeDetail.timeline.map((t, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-amber-800/80">
                    <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    <span className="min-w-0">
                      <span className="font-bold capitalize">{t.actor}</span>{" "}
                      <span className="text-amber-800/70">{t.note || t.action}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}

            {swap.dispute.status === "resolved" && (swap.dispute.resolutionNote || swap.dispute.outcome) && (
              <p className="mt-2 rounded-lg bg-emerald-100/70 px-3 py-2.5 text-sm min-h-11 text-emerald-900">
                <span className="font-bold">Moderator decision:</span>{" "}
                {swap.dispute.outcome === "refund_requester"
                  ? "credits refunded to the requester"
                  : swap.dispute.outcome === "release_owner"
                    ? "credits released to the owner"
                    : "no credits moved"}
                {swap.dispute.resolutionNote ? ` — “${swap.dispute.resolutionNote}”` : ""}
              </p>
            )}
          </div>
        )}

        {swap.dispute && disputeDetail && (
          <DisputeChatPanel swapId={swap.id} disputeId={disputeDetail.id} isOpen={swap.dispute.status === "open"} />
        )}

        {/* Return policy badge — mobile compact */}
        {swap.status === "completed" || swap.status === "accepted" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/20 px-3 py-2.5 text-sm min-h-11 sm:px-4 max-md:px-3 max-md:py-2 max-md:gap-1.5 max-md:text-xs max-md:min-h-9">
            <span className="inline-flex items-center gap-1 rounded-full border border-foreground/10 bg-background px-2 py-0.5 font-semibold text-foreground/60">
              <Shield className="h-3 w-3" /> Returns: {returnWindow === 0 ? "No returns" : `${returnWindow} days`}
            </span>
            {swap.completedAt && returnWindow !== 0 && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-sm min-h-9 font-bold ${returnWindowExpired ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                {returnWindowExpired ? `Window expired` : `Disputes open for ${Math.ceil((new Date(swap.completedAt).getTime() + returnWindow*86400000 - Date.now())/86400000)}d`}
              </span>
            )}
            {bundleListings[0]?.returnPolicy && <span className="text-foreground/50 truncate" title={bundleListings[0].returnPolicy}>{bundleListings[0].returnPolicy}</span>}
          </div>
        ) : null}
        {/* Open a dispute — mobile compact */}
        {canDispute ? (
          <div className="flex items-center gap-2 border-b border-border bg-muted/30 px-3 py-1.5 sm:px-4 max-md:px-3 max-md:py-2 max-md:gap-1.5">
            <p className="text-xs text-foreground/60 max-md:text-[11px] max-md:leading-tight">Something go wrong? {swap.status === "completed" ? `You have ${returnWindow} days to dispute · ` : ""}Open a case with photo evidence.</p>
            <span className="ml-auto inline-flex items-center gap-1 max-md:shrink-0">
              <button
                onClick={() => setDisputeOpen(true)}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-2 text-sm font-bold min-h-9 text-amber-700 transition-colors hover:bg-amber-100 max-md:px-2 max-md:py-1.5 max-md:text-xs max-md:min-h-8 max-md:gap-1"
              >
                <Scale className="h-3.5 w-3.5" /> Open a dispute
              </button>
              <HelpTooltip
                label="What does Open a dispute do?"
                text={`Opens a case with Swapt moderators. Include what went wrong and photo evidence. Return window: ${returnWindow === 0 ? "No returns" : `${returnWindow} days`} — moderators decide whether to refund or release the escrowed credits.`}
                side="top"
                align="end"
              />
            </span>
          </div>
        ) : swap.status === "completed" && !swap.dispute ? (
          <div className="border-b border-border bg-rose-50/60 px-3 py-2.5 text-sm min-h-11 text-rose-700 sm:px-4">
            {returnWindow === 0 ? "No returns on this listing — disputes cannot be opened after completion." : returnWindowExpired ? `Return window expired (${returnWindow} days) — disputes are closed.` : null}
          </div>
        ) : null}
        </div>

        {/* Transcript — mobile: bigger chat area, desktop unchanged */}
        <div ref={listRef} onScroll={onScroll} className="flex-1 min-h-[260px] space-y-2 overflow-y-auto overscroll-contain px-3 py-4 sm:px-5 pb-[max(16px,env(safe-area-inset-bottom))] max-md:min-h-[45vh] max-md:flex-[1_1_0] max-md:px-3 max-md:py-3 max-md:space-y-2.5 max-md:pb-24">
          {hasMore && (
            <div className="flex justify-center pb-1">
              <button
                onClick={onLoadOlder}
                disabled={loadingOlder}
                className="rounded-full border border-border bg-background px-4 py-2 text-sm min-h-11 font-semibold transition-colors hover:bg-muted disabled:opacity-60"
              >
                {loadingOlder ? "Loading…" : "Load older messages"}
              </button>
            </div>
          )}

          {messagesLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : timeline.length === 0 ? (
            <div className="grid h-full place-items-center text-center text-sm text-foreground/50">
              <div>
                <p className="text-4xl">👋</p>
                <p className="mt-3 font-semibold text-foreground/70">No messages yet</p>
                <p className="mt-1">Start the conversation below — say hello!</p>
              </div>
            </div>
          ) : (
            timeline.map((item, i) =>
              "type" in item ? (
                <div key={`day-${i}`} className="my-2 flex justify-center">
                  <span className="rounded-full bg-background/80 px-3 py-2 text-sm min-h-9 font-bold uppercase tracking-wider text-foreground/45 shadow-sm">
                    {item.label}
                  </span>
                </div>
              ) : (
                <MessageBubble key={item.id} m={item} counterparty={swap.counterparty} swap={swap} />
              ),
            )
          )}

          {counterpartyTyping && (
            <div className="flex items-end gap-2 pl-1">
              <Avatar url={swap.counterparty.avatarUrl} name={swap.counterparty.name} size={26} className="mb-0.5" />
              <div className="rounded-2xl rounded-bl-sm border border-border bg-background px-3.5 py-2.5 text-sm text-foreground/50 shadow-sm">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "300ms" }} />
                  <span className="ml-1.5 italic">{swap.counterparty.name.split(" ")[0] ?? "They"} is typing…</span>
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Composer — mobile fixed bottom so input always visible, desktop unchanged */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (sending) return;
            send(imageFile);
            setImageFile(null);
          }}
          className="shrink-0 border-t border-border bg-card px-3 pt-2.5 sm:px-4 max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-30 max-md:bg-card max-md:border-t max-md:px-3 max-md:pt-2 max-md:shadow-[0_-8px_24px_rgba(0,0,0,0.08)]"
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
              onChange={(e) => onCompose(e.target.value)}
              placeholder={`Message ${swap.counterparty.name.split(" ")[0] || "them"}…`}
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

        {/* Right side map panel — desktop only, slides in with smooth animation */}
        <div
          className={cn(
            "hidden lg:flex shrink-0 flex-col overflow-hidden transition-all duration-500 ease-in-out",
            showSideMap ? "w-[420px] xl:w-[480px] opacity-100 translate-x-0" : "w-0 opacity-0 translate-x-6 pointer-events-none",
          )}
          aria-hidden={!showSideMap}
        >
          {showSideMap && hasAnyMap && (
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-emerald-200 bg-card shadow-sm animate-in fade-in slide-in-from-right-2 duration-500">
              <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50/80 px-3 py-2.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-600 text-white">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-black text-emerald-800">{swap.meetupPlace || "Meetup location"}</p>
                  {swap.meetupTime && (
                    <p className="truncate text-xs font-medium text-emerald-700/70">
                      {new Date(swap.meetupTime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setMapOpen(false)}
                  aria-label="Close map"
                  className="grid h-7 w-7 place-items-center rounded-full bg-white text-foreground/50 shadow-sm transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Satellite filter — smooth toggle */}
              <div className="flex items-center justify-between border-b border-emerald-100 bg-white px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                  <Layers className="h-3.5 w-3.5" /> View
                </span>
                <div className="flex rounded-full bg-muted p-1">
                  <button
                    type="button"
                    onClick={() => setMapLayer("standard")}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold min-h-9 transition-all", mapLayer === "standard" ? "bg-emerald-600 text-white shadow-sm" : "text-foreground/60 hover:text-foreground")}
                  >
                    <MapIcon className="h-3.5 w-3.5" /> Map
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapLayer("satellite")}
                    className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-bold min-h-9 transition-all", mapLayer === "satellite" ? "bg-emerald-600 text-white shadow-sm" : "text-foreground/60 hover:text-foreground")}
                  >
                    <Satellite className="h-3.5 w-3.5" /> Satellite
                  </button>
                </div>
              </div>

              <div className="relative flex-1 bg-muted">
                {mapLayer === "satellite" && satelliteHtml ? (
                  <iframe
                    title={`Meetup satellite — ${swap.meetupPlace || "local spot"}`}
                    srcDoc={satelliteHtml}
                    className="absolute inset-0 h-full w-full border-0"
                    loading="lazy"
                  />
                ) : standardMapSrc ? (
                  <iframe
                    title={`Meetup map — ${swap.meetupPlace || "local spot"}`}
                    src={standardMapSrc}
                    className="absolute inset-0 h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : null}
              </div>

              <div className="border-t border-emerald-100 bg-emerald-50/40 px-3 py-2.5">
                {swap.meetupLat != null && swap.meetupLng != null && (
                  <p className="font-mono text-xs text-foreground/50">
                    {Number(swap.meetupLat).toFixed(4)}, {Number(swap.meetupLng).toFixed(4)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${swap.meetupLat ?? ""}&mlon=${swap.meetupLng ?? ""}#map=16/${swap.meetupLat ?? ""}/${swap.meetupLng ?? ""}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-2.5 text-sm min-h-11 font-bold text-emerald-800 transition-colors hover:bg-emerald-100"
                  >
                    <MapPin className="h-3 w-3" /> Open in OSM
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(swap.meetupPlace || `${swap.meetupLat},${swap.meetupLng}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 py-2.5 text-sm min-h-11 font-bold text-emerald-800 transition-colors hover:bg-emerald-100"
                  >
                    <MapPin className="h-3 w-3" /> Google Maps
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dispute dialog */}
      {disputeOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Open a dispute" onClick={() => setDisputeOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-md animate-in overflow-y-auto rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-amber-600" />
              <h2 className="flex-1 text-lg font-black tracking-tight">Open a dispute</h2>
              <button onClick={() => setDisputeOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              Disputes go to a moderator who reviews the thread. Only one open dispute per swap.
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">Reason</span>
                <select
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value as (typeof DISPUTE_REASONS)[number])}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-amber-500/60"
                >
                  {DISPUTE_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">What happened?</span>
                <textarea
                  value={disputeDesc}
                  onChange={(e) => setDisputeDesc(e.target.value)}
                  rows={3}
                  maxLength={1000}
                  placeholder="Describe the issue briefly…"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-amber-500/60"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">Evidence photos (optional, up to 6)</span>
                <input
                  id="dispute-evidence-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []).slice(0, 6);
                    setDisputeFiles(files);
                    e.target.value = "";
                  }}
                  className="hidden"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    onClick={() => document.getElementById("dispute-evidence-input")?.click()}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:bg-amber-100"
                  >
                    <ImagePlus className="h-3.5 w-3.5" />
                    {disputeFiles.length > 0 ? `${disputeFiles.length} file(s) selected` : "Add photos"}
                  </span>
                  {disputeFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDisputeFiles([])}
                      className="rounded-lg px-2 py-2 text-sm min-h-9 font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </label>

              {disputeError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{disputeError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setDisputeOpen(false)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/70 transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={submitDispute}
                  disabled={disputeBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
                >
                  {disputeBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Submit dispute
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Counter-offer dialog */}
      {counterOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Send a counter-offer" onClick={() => setCounterOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-md animate-in overflow-y-auto rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Handshake className="h-5 w-5 text-brand" />
              <h2 className="flex-1 text-lg font-black tracking-tight">Counter-offer</h2>
              <button onClick={() => setCounterOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              Fire back your own terms. The requester can accept, decline or counter again — each offer restarts the 7-day window.
            </p>

            <Tabs defaultValue="offer" className="mt-4 w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="offer">Counter Details</TabsTrigger>
                <TabsTrigger value="message" className="gap-1.5">
                  Message <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs font-bold normal-case tracking-normal text-foreground/45">optional</span>
                  {counterChatMsg.trim() && <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="offer" className="space-y-3 pt-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">Your note to them</span>
                  <textarea
                    value={counterNote}
                    onChange={(e) => setCounterNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="How about this instead?…"
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
                  />
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={counterMeetup}
                    onChange={(e) => setCounterMeetup(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-brand"
                  />
                  <span className="text-sm font-semibold">Meet up locally instead of shipping</span>
                </label>

                {counterMeetup && (
                  <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <LocationPicker
                      label="Place"
                      required
                      value={counterPlace}
                      lat={counterLat}
                      lng={counterLng}
                      onChange={({ place, lat, lng }) => {
                        setCounterPlace(place);
                        setCounterLat(lat);
                        setCounterLng(lng);
                      }}
                      placeholder="Search café, mall, street… or drag pin on map"
                      error={counterError && !counterPlace.trim() ? counterError : undefined}
                    />
                    <label className="block">
                      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-emerald-800/70">Time</span>
                      <input
                        type="datetime-local"
                        value={counterTime}
                        onChange={(e) => setCounterTime(e.target.value)}
                        className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500/60"
                      />
                    </label>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="message" className="space-y-2 pt-3 text-sm">
                <label className="block">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">Message to send with counter</span>
                  <textarea
                    value={counterChatMsg}
                    onChange={(e) => setCounterChatMsg(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder="Add a message with your counter-offer (optional) — this will appear in chat as a normal bubble alongside the counter card…"
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
                  />
                  <span className="mt-1 block text-right text-xs text-foreground/40">{counterChatMsg.length}/1000</span>
                </label>
                <p className="text-xs leading-relaxed text-foreground/50">
                  Optional — if filled, it’s sent as a chat message so the other person sees it in the transcript right after the counter-offer card.
                </p>
              </TabsContent>
            </Tabs>

            <div className="mt-3 space-y-3 text-sm">
              {counterError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{counterError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setCounterOpen(false)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/70 transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={submitCounter}
                  disabled={counterBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-xs font-bold text-brand-foreground transition-colors hover:brightness-110 disabled:opacity-60"
                >
                  {counterBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Send counter-offer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Meetup scheduling dialog */}
      {meetupEditOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Schedule the meetup" onClick={() => setMeetupEditOpen(false)}>
          <div
            className="max-h-[90vh] w-full max-w-md animate-in overflow-y-auto rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-emerald-600" />
              <h2 className="flex-1 text-lg font-black tracking-tight">Schedule the meetup</h2>
              <button onClick={() => setMeetupEditOpen(false)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-1 text-xs text-foreground/55">
              Pick a public place and time. Both of you can edit this until the swap is completed.
            </p>

            <div className="mt-4 space-y-3 text-sm">
              <LocationPicker
                label="Place"
                required
                value={meetupPlaceInput}
                lat={meetupLatInput}
                lng={meetupLngInput}
                onChange={({ place, lat, lng }) => {
                  setMeetupPlaceInput(place);
                  setMeetupLatInput(lat);
                  setMeetupLngInput(lng);
                }}
                placeholder="Search exact meetup spot… drag pin for precise location"
                error={meetupError && !meetupPlaceInput.trim() ? meetupError : undefined}
              />
              <label className="block">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/50">Time</span>
                <input
                  type="datetime-local"
                  value={meetupTimeInput}
                  onChange={(e) => setMeetupTimeInput(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-emerald-500/60"
                />
              </label>

              {meetupError && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{meetupError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setMeetupEditOpen(false)}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/70 transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={submitMeetup}
                  disabled={meetupBusy || !meetupPlaceInput.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                >
                  {meetupBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save meetup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Confirmation summary shown before the owner accepts — the items, any
 *  credits balance and how the exchange happens, so accept is an informed,
 *  deliberate move. */
function AcceptSummaryDialog({
  swap,
  busy,
  onConfirm,
  onClose,
}: {
  swap: SwapRecord;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const net = netCredits(swap);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Accept this swap" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md animate-in overflow-y-auto rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Check className="h-5 w-5 text-emerald-600" />
          <h2 className="flex-1 text-lg font-black tracking-tight">Accept this swap?</h2>
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full text-foreground/50 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-foreground/55">
          Accepting locks in the exchange below. This can't be undone once both sides have moved.
        </p>

        <div className="mt-4 space-y-1.5">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <img src={swap.requestedListing?.images[0]} alt="" className="h-12 w-12 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{swap.requestedListing?.title ?? "Your listing"}</p>
              <p className="text-xs text-foreground/55">
                {swap.requestedListing ? `worth ${swap.requestedListing.value} credits` : "—"}
              </p>
            </div>
          </div>
          <div className="flex justify-center text-foreground/40">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-2.5">
            <img src={swap.offeredListing?.images[0]} alt="" className="h-12 w-12 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{swap.offeredListing?.title ?? "Their pick"}</p>
              <p className="text-xs text-foreground/55">
                {swap.offeredListing ? `worth ${swap.offeredListing.value} credits` : "no clothing offered"}
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-4 space-y-2 rounded-lg border border-border bg-background p-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-foreground/55">Balance</dt>
            <dd className="font-bold">{net > 0 ? `+ ${net} credits` : "Even swap"}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-foreground/55">Exchange</dt>
            <dd className="font-bold">{swap.meetup ? "Meetup" : "Shipping"}</dd>
          </div>
          {swap.meetup && (swap.meetupPlace || swap.meetupTime) && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-foreground/55">When &amp; where</dt>
              <dd className="text-right font-bold">
                {swap.meetupPlace}
                {swap.meetupTime
                  ? ` · ${new Date(swap.meetupTime).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`
                  : ""}
              </dd>
            </div>
          )}
        </dl>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground/70 transition-colors hover:bg-muted"
          >
            Not yet
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Accept swap
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  m,
  counterparty,
  swap,
}: {
  m: SwapMessage;
  counterparty: SwapRecord["counterparty"];
  swap?: SwapRecord;
}) {
  if (m.kind === "system") {
    const body = m.body.toLowerCase();
    const isCounter = body.includes("counter");
    const isDeclined = body.includes("declined");
    const isCancelled = body.includes("cancelled");
    const isAccepted = body.includes("accepted");
    const isCompleted = body.includes("completed");
    const isDeclineOrCancel = isDeclined || isCancelled;
    // Make state-change system messages impossible to miss — colour-coded pills/cards with icons.
    if (isCounter) {
      // Try to parse detailed counter: "user sent a counter-offer — Note: ... • Meetup at ... • Pin: lat,lng"
      const hasDetails = m.body.includes(" — ");
      if (hasDetails) {
        const [header, ...rest] = m.body.split(" — ");
        const detailsStr = rest.join(" — ");
        const parts = detailsStr.split(" • ").map((p) => p.trim()).filter(Boolean);
        // Extract coords like [28.6139, 77.2090] or Pin: 28.6139, 77.2090
        const coordMatch = m.body.match(/\[(-?\d+\.\d+),\s*(-?\d+\.\d+)\]/) || m.body.match(/Pin:\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
        const cLat = coordMatch ? parseFloat(coordMatch[1]) : null;
        const cLng = coordMatch ? parseFloat(coordMatch[2]) : null;
        const author = header.split(" sent")[0]?.trim() || "Someone";
        return (
          <div className="my-3 flex justify-center max-md:my-2">
            <div className="w-full max-w-[92%] sm:max-w-[78%] overflow-hidden rounded-xl border border-brand/20 bg-gradient-to-br from-brand/10 via-brand/[0.04] to-card shadow-sm max-md:max-w-[94%] max-md:rounded-xl">
              <div className="flex items-center gap-2 bg-brand/10 px-3 py-2 max-md:gap-1.5 max-md:px-2.5 max-md:py-1.5">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white shadow-sm">
                  <Handshake className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black text-brand">Counter-offer</p>
                  <p className="truncate text-xs font-medium text-foreground/60">{author} updated the terms • {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-2 text-sm min-h-9 font-bold text-white">what changed</span>
              </div>
              <div className="space-y-1.5 px-3 py-2.5">
                {parts.map((p, i) => {
                  const isNote = p.toLowerCase().startsWith("note:");
                  const isMeetup = p.toLowerCase().startsWith("meetup") || p.toLowerCase().startsWith("place:");
                  const isTime = p.toLowerCase().startsWith("time:");
                  const isPin = p.toLowerCase().startsWith("pin:");
                  const Icon = isNote ? Info : isMeetup ? MapPin : isTime ? Clock : isPin ? MapPin : Handshake;
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                      <span className={cn(isNote ? "italic text-foreground/80" : "text-foreground/70")}>{p}</span>
                    </div>
                  );
                })}
                {parts.length === 0 && <p className="text-xs text-foreground/70">{m.body}</p>}
                {cLat != null && cLng != null && (
                  <div className="mt-2 overflow-hidden rounded-lg border border-brand/15">
                    <div className="relative h-28 w-full bg-muted">
                      <iframe
                        title="Counter location"
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${cLng - 0.008}%2C${cLat - 0.004}%2C${cLng + 0.008}%2C${cLat + 0.004}&layer=mapnik&marker=${cLat}%2C${cLng}`}
                        className="h-full w-full border-0"
                        loading="lazy"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-card px-2.5 py-1.5">
                      <span className="font-mono text-xs text-foreground/50">{cLat.toFixed(4)}, {cLng.toFixed(4)}</span>
                      <a
                        href={`https://www.openstreetmap.org/?mlat=${cLat}&mlon=${cLng}#map=16/${cLat}/${cLng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md bg-brand px-2 py-2 text-sm min-h-9 font-bold text-white hover:bg-brand/90"
                      >
                        <MapPin className="h-3 w-3" /> View pin
                      </a>
                    </div>
                  </div>
                )}
                {/* Fallback to current swap pin if message has no coords but swap does */}
                {cLat == null && swap?.meetupLat != null && swap?.meetupLng != null && (
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-foreground/50">
                    <MapPin className="h-3 w-3 text-brand" /> Current meetup: {swap.meetupPlace || "pinned location"} — {swap.meetupLat.toFixed(4)}, {swap.meetupLng.toFixed(4)}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }
      // Fallback simple pill for old short messages — mobile compact
      return (
        <div className="my-2 flex justify-center max-md:my-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-3.5 py-2.5 text-sm min-h-11 font-bold text-brand shadow-sm max-md:gap-1 max-md:px-3 max-md:py-2 max-md:text-xs max-md:min-h-9 max-md:rounded-2xl max-md:max-w-[94%] max-md:text-center">
            <Handshake className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" /> {m.body}
          </span>
        </div>
      );
    }
    if (isDeclineOrCancel) {
      return (
        <div className="my-2 flex justify-center max-md:my-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm min-h-11 font-bold text-rose-700 shadow-sm max-md:gap-1 max-md:px-3 max-md:py-2 max-md:text-xs max-md:font-bold max-md:min-h-9 max-md:rounded-2xl max-md:max-w-[94%] max-md:text-center max-md:leading-tight">
            <XCircle className="h-3.5 w-3.5 max-md:h-3 max-md:w-3 max-md:shrink-0" /> {m.body}
          </span>
        </div>
      );
    }
    if (isAccepted) {
      return (
        <div className="my-2 flex justify-center max-md:my-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm min-h-11 font-bold text-emerald-700 shadow-sm max-md:gap-1 max-md:px-3 max-md:py-2 max-md:text-xs max-md:min-h-9 max-md:rounded-2xl max-md:max-w-[94%] max-md:text-center">
            <CheckCheck className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" /> {m.body}
          </span>
        </div>
      );
    }
    if (isCompleted) {
      return (
        <div className="my-2 flex justify-center max-md:my-1.5">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm min-h-11 font-bold text-emerald-700 shadow-sm max-md:gap-1 max-md:px-3 max-md:py-2 max-md:text-xs max-md:min-h-9 max-md:rounded-2xl max-md:max-w-[94%] max-md:text-center">
            <Award className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" /> {m.body}
          </span>
        </div>
      );
    }
    return (
      <div className="my-1 flex justify-center max-md:my-0.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-2 text-sm min-h-9 text-foreground/60 max-md:gap-1 max-md:px-3 max-md:py-1.5 max-md:text-xs max-md:min-h-8 max-md:rounded-full max-md:max-w-[92%] max-md:text-center max-md:leading-tight">
          <Info className="h-3 w-3 opacity-60 max-md:h-3 max-md:w-3" /> {m.body}
        </span>
      </div>
    );
  }

  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex items-end gap-2 max-md:gap-1.5 ${m.mine ? "justify-end" : "justify-start"}`}>
      {!m.mine && counterparty.username ? (
        <Link
          to="/seller/$username"
          params={{ username: counterparty.username }}
          aria-label={`View ${counterparty.name}'s profile`}
          className="mb-0.5 shrink-0 rounded-full transition-transform hover:scale-105"
        >
          <Avatar url={counterparty.avatarUrl} name={counterparty.name} size={26} />
        </Link>
      ) : !m.mine ? (
        <Avatar url={counterparty.avatarUrl} name={counterparty.name} size={26} className="mb-0.5" />
      ) : null}
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm shadow-sm max-md:max-w-[78%] max-md:px-3 max-md:py-2 max-md:text-[14px] max-md:leading-relaxed ${
          m.mine
            ? "rounded-br-sm bg-gradient-to-br from-brand to-brand/90 text-brand-foreground max-md:rounded-2xl max-md:rounded-br-md"
            : "rounded-bl-sm border border-border bg-background text-foreground max-md:rounded-2xl max-md:rounded-bl-md max-md:border-border/60"
        }`}
      >
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
        {m.image && (
          <a
            href={m.image}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 block overflow-hidden rounded-lg"
            aria-label="Open shared photo"
          >
            <img src={m.image} alt="Shared in chat" className="max-h-56 w-full object-cover" />
          </a>
        )}
        <p
          className={`mt-1 flex items-center justify-end gap-1 text-xs ${
            m.mine ? "text-brand-foreground/70" : "text-foreground/45"
          }`}
        >
          {time}
          {m.mine && (m.readAt ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3 opacity-60" />)}
        </p>
      </div>
    </div>
  );
}

const CARRIERS = [
  { id: "usps", label: "USPS" },
  { id: "ups", label: "UPS" },
  { id: "fedex", label: "FedEx" },
  { id: "dhl", label: "DHL" },
  { id: "royalmail", label: "Royal Mail" },
] as const;

const SHIPPING_STATUS_LABEL: Record<string, string> = {
  awaiting_shipment: "Awaiting shipment",
  shipped: "Shipped",
  in_transit: "In transit",
  delivered: "Delivered",
  exception: "Delivery exception",
};

const SHIPPING_STATUS_TONE: Record<string, string> = {
  awaiting_shipment: "bg-amber-100 text-amber-700",
  shipped: "bg-sky-100 text-sky-700",
  in_transit: "bg-violet-100 text-violet-700",
  delivered: "bg-emerald-100 text-emerald-700",
  exception: "bg-rose-100 text-rose-700",
};

function ShippingPanel({
  swap,
  isOwner,
  onUpdated,
}: {
  swap: SwapRecord;
  isOwner: boolean;
  onUpdated: () => void;
}) {
  const [carrier, setCarrier] = useState<string>(swap.carrier || "usps");
  const [trackingNumber, setTrackingNumber] = useState(swap.trackingNumber ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const trackingUrl =
    swap.trackingNumber && swap.carrier
      ? carrierLink(swap.carrier, swap.trackingNumber)
      : null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await updateSwapTracking(swap.id, { carrier, trackingNumber: trackingNumber.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      onUpdated();
    } catch {
      /* ignore tracking errors */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-sky-200 bg-sky-50/60 px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white">
          <Package className="h-3 w-3" /> Shipping
        </span>
        {swap.carrier && swap.trackingNumber && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide ${SHIPPING_STATUS_TONE[swap.shippingStatus ?? "shipped"] ?? "bg-muted"}`}>
            <Truck className="h-3 w-3" /> {SHIPPING_STATUS_LABEL[swap.shippingStatus ?? "shipped"] ?? swap.shippingStatus}
          </span>
        )}
      </div>

      {trackingUrl && (
        <a
          href={trackingUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-sky-700 underline-offset-2 hover:underline"
        >
          <Truck className="h-3.5 w-3.5" />
          {swap.carrier.toUpperCase()} · {swap.trackingNumber} — track package
        </a>
      )}

      {swap.labelUrl && (
        <button
          onClick={() => window.open(swap.labelUrl, "_blank")}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-sky-300 bg-white px-2 py-2 text-sm font-bold min-h-9 text-sky-700 transition-colors hover:bg-sky-100"
        >
          <Printer className="h-3 w-3" /> Print label
        </button>
      )}

      {isOwner && swap.status === "accepted" ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex-1 min-w-[7rem]">
            <span className="text-xs font-bold uppercase tracking-wide text-sky-900/70">Carrier</span>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="mt-0.5 w-full rounded-lg border border-sky-200 bg-white px-2 py-2.5 text-sm min-h-11 font-semibold"
            >
              {CARRIERS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
          <label className="flex-1 min-w-[10rem]">
            <span className="text-xs font-bold uppercase tracking-wide text-sky-900/70">Tracking number</span>
            <input
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder={swap.trackingNumber || "e.g. 9400111899223812445011"}
              className="mt-0.5 w-full rounded-lg border border-sky-200 bg-white px-2 py-2.5 text-sm min-h-11 font-semibold"
            />
          </label>
          <button
            onClick={submit}
            disabled={busy || !trackingNumber.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
            {saved ? "Saved ✓" : swap.trackingNumber ? "Update tracking" : "Add tracking"}
          </button>
        </div>
      ) : !swap.trackingNumber ? (
        <p className="mt-2 text-xs text-sky-900/60">
          The owner will share a tracking number once this swap ships.
        </p>
      ) : null}
    </div>
  );
}

function carrierLink(carrier: string, tracking: string): string {
  switch (carrier) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${encodeURIComponent(tracking)}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(tracking)}`;
    case "dhl":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encodeURIComponent(tracking)}`;
    case "royalmail":
      return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(tracking)}`;
    default:
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
  }
}