import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings } from "@/lib/mock-listings";
import type { MyListing, SwapRecord } from "@/lib/dashboard-api";
import { applyDemoCredits, currentLocalUser } from "@/lib/local-account";
import { nextDemoReceiptNo, recordDemoLedger } from "@/lib/payments-api";
import { markDemoSold } from "@/lib/sold";

export type SwapMessage = {
  id: string;
  kind: "text" | "system";
  body: string;
  /** Optional photo on a text message (a data/blob URL in demo mode). */
  image?: string | null;
  author: string;
  mine: boolean;
  /** ISO timestamp of when the counterparty read it — null while unread. */
  readAt: string | null;
  createdAt: string;
};

export type MessagePage = {
  items: SwapMessage[];
  hasMore: boolean;
  nextCursor: string | null;
  /** The other member's summary — present on conversation-scoped threads. */
  other?: { username: string; name: string; avatarUrl: string | null } | null;
};

/** A row in the member's inbox: a swap chat or a plain-text conversation. */
export type ConversationSummary = {
  id: string;
  counterparty: { id: string | null; username: string; name: string; avatarUrl: string | null };
  lastMessage: SwapMessage | null;
  unreadCount: number;
  /** Newest swap in the thread, so swap chats deep-link to the swap page. */
  swapId: string | null;
  lastMessageAt: string | null;
};

export type SwapStatus = SwapRecord["status"];

export const MESSAGE_PAGE_SIZE = 30;

// ---- demo store (no VITE_API_URL) -------------------------------------------
function demoCard(i: number, overrides: Partial<MyListing> = {}): MyListing {
  const l = mockListings[i % mockListings.length];
  return {
    id: l.id, title: l.title, brand: l.brand, category: l.category, size: l.size,
    value: l.value, status: "active", featured: false, images: l.images,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
    ...overrides,
  };
}

const demoSwaps = new Map<string, SwapRecord>();
const demoThreads = new Map<string, SwapMessage[]>();
/** swap id → conversation key (the counterparty username) so later swaps with
 *  the same member continue the same chat thread in demo mode. */
const demoConvBySwap = new Map<string, string>();
/** Plain-text conversations (no swap) started in demo mode, keyed by id. */
const demoPlainConvs = new Map<string, ConversationSummary>();
/** swap id → credits actually held in escrow (capped at what the requester
 *  could afford) — the ledger must refund/release this exact amount. */
const demoHeldBySwap = new Map<string, number>();

function convKeyFor(swapId: string): string {
  return demoConvBySwap.get(swapId) ?? swapId;
}

function threadFor(swapId: string): SwapMessage[] {
  const key = convKeyFor(swapId);
  if (!demoThreads.has(key)) demoThreads.set(key, []);
  return demoThreads.get(key)!;
}

function appendThread(swapId: string, ...msgs: SwapMessage[]) {
  demoThreads.set(convKeyFor(swapId), [...threadFor(swapId), ...msgs]);
}

function seedDemo() {
  if (demoSwaps.size) return;
  const seeds: SwapRecord[] = [
    {
      id: "s1", direction: "incoming", status: "pending", message: "Would you swap for my Levi's jacket?",
      counterparty: { username: "mira.k", name: "Mira K." }, counterpartyId: "u_mira",
      requestedListing: demoCard(0), offeredListing: demoCard(4), unreadCount: 2,
      createdAt: new Date(Date.now() - 86400000).toISOString(), completedAt: null, dispute: null, escrow: null,
      meetup: false, meetupPlace: "", meetupTime: null,
      shipping: true, carrier: "", trackingNumber: "", shippingStatus: "awaiting_shipment",
      expiresAt: new Date(Date.now() + 5 * 86400000).toISOString(), counteredAt: null,
    },
    {
      id: "s2", direction: "outgoing", status: "accepted", message: "Love this — happy to ship tomorrow.",
      counterparty: { username: "jonas", name: "Jonas P." },
      requestedListing: demoCard(2), offeredListing: demoCard(1), unreadCount: 0,
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(), completedAt: null, dispute: null,
      escrow: { amount: demoCard(2).value, status: "pending" },
      meetup: true, meetupPlace: "Borough Market, London", meetupTime: null,
      shipping: false, carrier: "", trackingNumber: "", shippingStatus: null,
    },
    {
      id: "s3", direction: "outgoing", status: "completed", message: "",
      counterparty: { username: "ally.w", name: "Ally W." },
      requestedListing: demoCard(3), offeredListing: demoCard(5), unreadCount: 0,
      createdAt: new Date(Date.now() - 86400000 * 21).toISOString(),
      completedAt: new Date(Date.now() - 86400000 * 18).toISOString(), dispute: null, escrow: null,
      meetup: false, meetupPlace: "", meetupTime: null,
      shipping: true, carrier: "USPS", trackingNumber: "9400111899223812445011", shippingStatus: "delivered",
    },
  ];

  // A long back-and-forth so pagination is demonstrable in preview mode.
  const smallTalk = [
    "Hey! Love this piece.", "Thanks — it's barely been worn.",
    "Would you consider my denim jacket?", "Send me a photo of the back?",
    "Just posted it to my closet.", "Looks great, similar value too.",
    "Any marks on the sleeves?", "None at all, smoke-free home.",
    "Where would you ship from?", "Brooklyn — usually next day.",
    "Perfect, that works for me.", "Shall we lock it in?",
  ];

  for (const s of seeds) {
    demoSwaps.set(s.id, s);
    demoConvBySwap.set(s.id, s.counterparty.username);
    // Track any credits already held so a terminal action releases/refunds the
    // exact amount (never mints more than was held).
    if (s.escrow?.status === "pending" && s.escrow.amount > 0) {
      demoHeldBySwap.set(s.id, s.escrow.amount);
    }
    const start = new Date(s.createdAt).getTime();
    const thread: SwapMessage[] = [
      {
        id: `${s.id}-sys`, kind: "system", author: "", readAt: null,
        body: `${s.counterparty.username} proposed a swap for “${s.requestedListing?.title ?? "a listing"}”.`,
        mine: false, createdAt: s.createdAt,
      },
    ];
    const rounds = s.id === "s1" ? 42 : 6;
    for (let i = 0; i < rounds; i += 1) {
      const mine = i % 2 === 1;
      thread.push({
        id: `${s.id}-m${i}`,
        kind: "text",
        author: mine ? "you" : s.counterparty.username,
        body: smallTalk[i % smallTalk.length],
        mine,
        // Older half of my messages are read; the newest ones are only delivered.
        readAt: mine && i < rounds - 3 ? new Date(start + (i + 1) * 60000).toISOString() : null,
        createdAt: new Date(start + i * 60000).toISOString(),
      });
    }
    demoThreads.set(s.counterparty.username, thread);
  }
}

function demoPage(id: string, cursor?: string | null): MessagePage {
  const all = threadFor(id);
  const end = cursor ? all.findIndex((m) => m.id === cursor) : all.length;
  const stop = end < 0 ? all.length : end;
  const startIdx = Math.max(0, stop - MESSAGE_PAGE_SIZE);
  const items = all.slice(startIdx, stop);
  return {
    items,
    hasMore: startIdx > 0,
    nextCursor: startIdx > 0 && items.length ? items[0].id : null,
  };
}

/** Demo inbox: one row per seeded swap plus any plain-text chats started this
 *  session, newest first. */
function demoConversations(): ConversationSummary[] {
  seedDemo();
  const out: ConversationSummary[] = [];
  for (const [id, s] of demoSwaps) {
    const key = convKeyFor(id);
    const thread = demoThreads.get(key) ?? [];
    const last = thread[thread.length - 1] ?? null;
    out.push({
      id: key,
      counterparty: { id: null, username: s.counterparty.username, name: s.counterparty.name, avatarUrl: null },
      lastMessage: last,
      unreadCount: s.unreadCount ?? 0,
      swapId: id,
      lastMessageAt: last?.createdAt ?? s.createdAt,
    });
  }
  for (const conv of demoPlainConvs.values()) out.push(conv);
  return out.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

/** Demo fallback for starting a plain-text chat with a member. */
function demoStartConversation(to: string, body: string): { conversationId: string; message: SwapMessage } {
  seedDemo();
  const key = `plain:${to}`;
  const seller = mockListings.find((l) => l.seller.name === to)?.seller;
  const name = seller?.name ?? to;
  const msg: SwapMessage = {
    id: crypto.randomUUID(), kind: "text", body, author: "you", mine: true,
    readAt: null, createdAt: new Date().toISOString(),
  };
  const conv: ConversationSummary = {
    id: key,
    counterparty: { id: null, username: to, name, avatarUrl: null },
    lastMessage: msg,
    unreadCount: 0,
    swapId: null,
    lastMessageAt: msg.createdAt,
  };
  demoPlainConvs.set(key, conv);
  demoThreads.set(key, [msg]);
  return { conversationId: key, message: msg };
}

// ---- API --------------------------------------------------------------------
export async function fetchSwap(id: string): Promise<SwapRecord | null> {
  if (!apiEnabled) {
    seedDemo();
    const swap = demoSwaps.get(id);
    return swap ? { ...swap, conversationId: convKeyFor(id) } : null;
  }
  const { swap } = await api<{ swap: SwapRecord }>(`/api/me/swaps/${id}`);
  return swap;
}

/** All demo-mode swaps (seeded + anything proposed this session), so the
 *  dashboard history reflects new proposals instead of a static snapshot. */
export function demoMySwaps(): SwapRecord[] {
  seedDemo();
  return [...demoSwaps.values()];
}

/**
 * One page of transcript, newest page first; pass `cursor` to load older.
 * Threads are per conversation so a later swap with the same member shows the
 * whole shared chat.
 */
/** Base messages endpoint for a thread. Conversation-scoped when the thread id
 *  is known (older swaps backfill it via the swap-scoped route), otherwise the
 *  swap-scoped route — which also exists on the API and resolves the
 *  conversation. */
function messagesPath(id: string, conversationId?: string | null) {
  return conversationId
    ? `/api/me/conversations/${conversationId}/messages`
    : `/api/me/swaps/${id}/messages`;
}

export async function fetchMessagePage(id: string, cursor?: string | null, conversationId?: string | null): Promise<MessagePage> {
  if (!apiEnabled) {
    seedDemo();
    return demoPage(id, cursor);
  }
  const params = new URLSearchParams({ limit: String(MESSAGE_PAGE_SIZE) });
  if (cursor) params.set("before", cursor);
  return api<MessagePage>(`${messagesPath(id, conversationId)}?${params}`);
}

/** Mark everything the counterparty sent as read. */
export async function markThreadRead(id: string, conversationId?: string | null): Promise<void> {
  if (!apiEnabled) {
    seedDemo();
    const key = convKeyFor(id);
    for (const [sid, swap] of demoSwaps) {
      if (demoConvBySwap.get(sid) === key) swap.unreadCount = 0;
    }
    return;
  }
  await api(`${messagesPath(id, conversationId)}/read`, { method: "POST" });
}

/** Hide a chat thread from this account's dashboard. The counterparty keeps
 *  the conversation — it's only removed from this member's swap history. */
export async function deleteConversation(conversationId: string | null | undefined): Promise<void> {
  if (!apiEnabled) {
    seedDemo();
    if (!conversationId) return;
    for (const [sid] of demoSwaps) {
      if (demoConvBySwap.get(sid) === conversationId) demoSwaps.delete(sid);
    }
    demoThreads.delete(conversationId);
    return;
  }
  await api(`/api/me/conversations/${conversationId}`, { method: "DELETE" });
}

export async function sendMessage(id: string, body: string, conversationId?: string | null, image?: File | null): Promise<SwapMessage> {
  if (!apiEnabled) {
    seedDemo();
    const msg: SwapMessage = {
      id: crypto.randomUUID(), kind: "text", body, author: "you", mine: true,
      readAt: null, createdAt: new Date().toISOString(),
      image: image ? URL.createObjectURL(image) : null,
    };
    appendThread(id, msg);
    return msg;
  }
  const path = messagesPath(id, conversationId);
  let response: { message: SwapMessage };
  if (image) {
    const form = new FormData();
    form.append("image", image);
    if (body.trim()) form.append("body", body);
    response = await api<{ message: SwapMessage }>(path, {
      method: "POST",
      body: form,
    });
  } else {
    response = await api<{ message: SwapMessage }>(path, {
      method: "POST",
      body: { body },
    });
  }
  return response.message;
}

/** The member's chat inbox — swap threads and plain-text conversations. */
export async function fetchConversations(): Promise<{ items: ConversationSummary[] }> {
  if (!apiEnabled) return { items: demoConversations() };
  return api<{ items: ConversationSummary[] }>("/api/me/conversations", { auth: true });
}

/** Start a plain-text chat (no swap) with a member, addressed by username. */
export async function startConversation(to: string, body: string): Promise<{ conversationId: string; message: SwapMessage }> {
  if (!apiEnabled) return demoStartConversation(to, body);
  return api<{ conversationId: string; message: SwapMessage }>("/api/me/conversations", {
    method: "POST",
    body: { to, body },
    auth: true,
  });
}

export async function updateSwapStatus(id: string, status: SwapStatus): Promise<void> {
  if (!apiEnabled) {
    seedDemo();
    const swap = demoSwaps.get(id);
    const me = currentLocalUser();
    const myCredits = me?.credits ?? 50;
    const myHeld = me?.creditsHeld ?? 0;
    const now = new Date().toISOString();

    // Net credits the requester owes — requested minus any offered clothing bundle.
    const requestedValue = swap?.requestedValue ?? swap?.requestedListing?.value ?? 0;
    const bundleVals = swap?.offeredBundle?.length ? swap.offeredBundle : (swap?.offeredListings?.length ? swap.offeredListings : (swap?.offeredListing ? [swap.offeredListing] : []));
    const offeredValue = swap?.offeredValue ?? bundleVals.reduce((s: number, l: any) => s + (l?.value ?? 0), 0);
    const net = Math.max(0, Number(requestedValue) - Number(offeredValue));

    if (swap && me) {
      if (status === "accepted") {
        // Outgoing: I'm the requester and I pay. Incoming: the counterparty
        // pays, so I only track the amount for later release/refund.
        const held = Math.min(net, swap.direction === "outgoing" ? myCredits : net);
        if (held > 0) {
          demoHeldBySwap.set(id, held);
          if (swap.direction === "outgoing") {
            applyDemoCredits({ credits: myCredits - held, creditsHeld: myHeld + held });
          }
          recordDemoLedger({
            id: crypto.randomUUID(), type: "escrow_hold", status: "pending", amount: held,
            currency: "credits", credit: "out", from: me.username, to: swap.counterparty.username,
            gateway: "credits", receiptNo: nextDemoReceiptNo(), note: "Escrow held for swap.",
            swapId: id, createdAt: now,
          });
        }
      } else if (status === "completed") {
        const held = demoHeldBySwap.get(id) ?? net;
        if (swap.direction === "outgoing" && held > 0) {
          // I'm the requester — my held credits are released to the owner.
          applyDemoCredits({ creditsHeld: Math.max(0, myHeld - held) });
          recordDemoLedger({
            id: crypto.randomUUID(), type: "escrow_release", status: "completed", amount: held,
            currency: "credits", credit: "out", from: me.username, to: swap.counterparty.username,
            gateway: "credits", receiptNo: nextDemoReceiptNo(), note: "Swap completed — escrow released.",
            swapId: id, createdAt: now,
          });
        } else if (swap.direction === "incoming" && held > 0) {
          // I'm the owner — I receive the escrowed credits.
          applyDemoCredits({ credits: myCredits + held });
          recordDemoLedger({
            id: crypto.randomUUID(), type: "escrow_release", status: "completed", amount: held,
            currency: "credits", credit: "in", from: swap.counterparty.username, to: me.username,
            gateway: "credits", receiptNo: nextDemoReceiptNo(), note: "Swap completed — escrow released.",
            swapId: id, createdAt: now,
          });
        }
        if (held > 0) demoHeldBySwap.delete(id);
        // The exchanged items are consumed — they stop appearing on browse.
        markDemoSold([swap.requestedListing?.id, swap.offeredListing?.id]);
      } else if (["declined", "cancelled"].includes(status) && swap.direction === "outgoing") {
        const held = demoHeldBySwap.get(id) ?? 0;
        if (held > 0) {
          // Refund exactly what was held — never the full value.
          applyDemoCredits({ credits: myCredits + held, creditsHeld: Math.max(0, myHeld - held) });
          demoHeldBySwap.delete(id);
          recordDemoLedger({
            id: crypto.randomUUID(), type: "escrow_refund", status: "completed", amount: held,
            currency: "credits", credit: "in", from: swap.counterparty.username, to: me.username,
            gateway: "credits", receiptNo: nextDemoReceiptNo(), note: "Escrow refunded — swap did not complete.",
            swapId: id, createdAt: now,
          });
        }
      }
    }

    if (swap) {
      swap.status = status;
      if (status === "completed") swap.completedAt = now;
    }
    appendThread(id, {
      id: crypto.randomUUID(), kind: "system", author: "", mine: false, readAt: null,
      body: `You marked this swap as ${status}.`, createdAt: now,
    });
    return;
  }
  await api(`/api/me/swaps/${id}`, { method: "PATCH", body: { status } });
}

/** Owner counters a pending swap — they may ask for a different listing of
 *  theirs, add a note and tweak the meetup details. `chatMessage` is an
 *  optional free-form message that will appear as a normal chat bubble
 *  alongside the system counter card. */
export async function counterSwap(
  id: string,
  input: { requestedListing?: string; message?: string; meetup?: boolean; meetupPlace?: string; meetupTime?: string; meetupLat?: number | null; meetupLng?: number | null; chatMessage?: string },
): Promise<void> {
  if (!apiEnabled) {
    seedDemo();
    const swap = demoSwaps.get(id);
    if (!swap) throw new Error("Swap not found");
    if (swap.status !== "pending") throw new Error("Only pending swaps can be countered");
    if (input.message) swap.message = input.message;
    if (typeof input.meetup === "boolean") {
      swap.meetup = input.meetup;
      if (input.meetup) {
        swap.shipping = false;
        swap.carrier = "";
        swap.trackingNumber = "";
        swap.shippingStatus = null;
        if (input.meetupPlace) swap.meetupPlace = input.meetupPlace;
        if (input.meetupLat != null) swap.meetupLat = input.meetupLat;
        if (input.meetupLng != null) swap.meetupLng = input.meetupLng;
      } else {
        swap.meetupPlace = "";
        swap.meetupLat = null;
        swap.meetupLng = null;
        if (!swap.shipping) swap.shipping = true;
      }
    } else {
      if (input.meetupPlace) swap.meetupPlace = input.meetupPlace;
      if (input.meetupLat != null) swap.meetupLat = input.meetupLat;
      if (input.meetupLng != null) swap.meetupLng = input.meetupLng;
    }
    swap.counteredAt = new Date().toISOString();
    swap.expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    // Build detailed counter message for chat, mirroring backend
    const parts: string[] = [];
    if (input.message) parts.push(`Note: "${input.message}"`);
    if (typeof input.meetup === "boolean") {
      if (input.meetup) {
        let s = "Meetup";
        const place = input.meetupPlace || swap.meetupPlace;
        if (place) s += ` at ${place}`;
        const t = input.meetupTime ? new Date(input.meetupTime) : swap.meetupTime ? new Date(swap.meetupTime) : null;
        if (t) s += ` on ${t.toLocaleString()}`;
        const clat = input.meetupLat ?? swap.meetupLat;
        const clng = input.meetupLng ?? swap.meetupLng;
        if (clat != null && clng != null) s += ` [${Number(clat).toFixed(4)}, ${Number(clng).toFixed(4)}]`;
        parts.push(s);
      } else {
        parts.push("Shipping");
      }
    } else {
      if (input.meetupPlace) parts.push(`Place: ${input.meetupPlace}`);
      if (input.meetupTime) parts.push(`Time: ${new Date(input.meetupTime).toLocaleString()}`);
      if (input.meetupLat != null && input.meetupLng != null) parts.push(`Pin: ${Number(input.meetupLat).toFixed(4)}, ${Number(input.meetupLng).toFixed(4)}`);
    }
    const detail = parts.length ? ` — ${parts.join(" • ")}` : "";
    appendThread(id, {
      id: crypto.randomUUID(), kind: "system", author: "", mine: false, readAt: null,
      body: `You sent a counter-offer${detail}.`, createdAt: new Date().toISOString(),
    });
    // Optional companion chat message — appears as a regular bubble so the
    // recipient sees the context alongside the structured counter card.
    const chatBody = (input.chatMessage ?? "").trim().slice(0, 1000);
    if (chatBody) {
      appendThread(id, {
        id: crypto.randomUUID(), kind: "text", author: "you", mine: true, readAt: null,
        body: chatBody, createdAt: new Date().toISOString(),
      });
    }
    return;
  }
  await api(`/api/me/swaps/${id}/counter`, { method: "POST", body: input });
}

/** Either member schedules/edits the meetup place + time (pending or accepted). */
export async function updateSwapMeetup(
  id: string,
  input: { meetupPlace?: string; meetupTime?: string; meetupLat?: number | null; meetupLng?: number | null },
): Promise<{ meetupPlace: string; meetupTime: string | null; meetupLat?: number | null; meetupLng?: number | null }> {
  if (!apiEnabled) {
    seedDemo();
    const swap = demoSwaps.get(id);
    if (!swap) throw new Error("Swap not found");
    if (input.meetupPlace) swap.meetupPlace = input.meetupPlace;
    if (input.meetupTime) swap.meetupTime = input.meetupTime;
    if (input.meetupLat != null) swap.meetupLat = input.meetupLat;
    if (input.meetupLng != null) swap.meetupLng = input.meetupLng;
    appendThread(id, {
      id: crypto.randomUUID(), kind: "system", author: "", mine: false, readAt: null,
      body: `You scheduled a meetup: ${swap.meetupPlace || "a local spot"}.`, createdAt: new Date().toISOString(),
    });
    return { meetupPlace: swap.meetupPlace, meetupTime: swap.meetupTime, meetupLat: swap.meetupLat ?? null, meetupLng: swap.meetupLng ?? null };
  }
  return api(`/api/me/swaps/${id}/meetup`, { method: "PATCH", body: input });
}

/** The requester confirms they received the item — the proof of delivery that
 *  unlocks completion for both parties. */
export async function confirmSwapReceipt(
  id: string,
): Promise<{ confirmed: boolean; receiptConfirmedAt: string | null }> {
  if (!apiEnabled) {
    seedDemo();
    const swap = demoSwaps.get(id);
    if (!swap) throw new Error("Swap not found");
    if (swap.status !== "accepted") throw new Error("Receipt can only be confirmed once the swap is accepted");
    swap.receiptConfirmedAt = new Date().toISOString();
    appendThread(id, {
      id: crypto.randomUUID(), kind: "system", author: "", mine: false, readAt: null,
      body: "You confirmed you received the item.", createdAt: new Date().toISOString(),
    });
    return { confirmed: true, receiptConfirmedAt: swap.receiptConfirmedAt };
  }
  return api(`/api/me/swaps/${id}/receipt`, { method: "POST" });
}

/** Record a carrier + tracking number on a shipping swap (owner, after accept). */
export async function updateSwapTracking(
  id: string,
  input: { carrier: string; trackingNumber: string; shippingStatus?: SwapRecord["shippingStatus"] },
): Promise<{ carrier: string; trackingNumber: string; shippingStatus: SwapRecord["shippingStatus"]; labelUrl?: string }> {
  if (!apiEnabled) {
    seedDemo();
    const swap = demoSwaps.get(id);
    if (!swap) throw new Error("Swap not found");
    swap.carrier = input.carrier || swap.carrier;
    swap.trackingNumber = input.trackingNumber;
    swap.shippingStatus = input.shippingStatus ?? "shipped";
    appendThread(id, {
      id: crypto.randomUUID(), kind: "system", author: "", mine: false, readAt: null,
      body: `You shared tracking: ${swap.carrier} ${swap.trackingNumber}.`, createdAt: new Date().toISOString(),
    });
    return { carrier: swap.carrier, trackingNumber: swap.trackingNumber, shippingStatus: swap.shippingStatus, labelUrl: swap.labelUrl };
  }
  return api(`/api/me/swaps/${id}/tracking`, { method: "POST", body: input });
}

export async function proposeSwap(input: {
  requestedListing: string;
  offeredListing?: string;
  offeredListings?: string[];
  message?: string;
  meetup?: boolean;
  meetupPlace?: string;
  meetupLat?: number | null;
  meetupLng?: number | null;
  shipping?: boolean;
  carrier?: string;
  shippingAddressId?: string;
}): Promise<string> {
  if (!apiEnabled) {
    seedDemo();
    const id = `demo-${Math.random().toString(36).slice(2, 8)}`;
    const requested = mockListings.find((l) => l.id === input.requestedListing);
    const sellerName = requested?.seller.name ?? "member";
    const card: MyListing | null = requested
      ? {
          id: requested.id, title: requested.title, brand: requested.brand, category: requested.category,
          size: requested.size, value: requested.value, status: "active", featured: false,
          images: requested.images, createdAt: new Date().toISOString(),
        }
      : null;
    const shipping = Boolean(input.shipping) && !input.meetup;
    const bundleIds = [...(input.offeredListings ?? []), ...(input.offeredListing ? [input.offeredListing] : [])].slice(0, 3);
    const bundle = bundleIds.map((oid) => {
      const idx = mockListings.findIndex((l) => l.id === oid);
      return idx >= 0 ? demoCard(idx) : demoCard(0, { id: oid });
    });
    const swap: SwapRecord = {
      id, conversationId: sellerName, direction: "outgoing", status: "pending", message: input.message ?? "", unreadCount: 0,
      counterparty: { username: sellerName, name: sellerName },
      requestedListing: card,
      offeredListing: bundle[0] ?? null,
      offeredListings: bundle,
      offeredBundle: bundle,
      createdAt: new Date().toISOString(), completedAt: null, dispute: null, escrow: null,
      meetup: Boolean(input.meetup), meetupPlace: input.meetup ? (input.meetupPlace ?? "") : "", meetupLat: input.meetup ? (input.meetupLat ?? null) : null, meetupLng: input.meetup ? (input.meetupLng ?? null) : null, meetupTime: null,
      shipping,
      carrier: shipping ? (input.carrier ?? "") : "",
      trackingNumber: "",
      shippingStatus: shipping ? "awaiting_shipment" : null,
    };
    demoSwaps.set(id, swap);
    demoConvBySwap.set(id, sellerName);
    // Same member, same conversation — the new request continues the previous thread.
    if (!demoThreads.has(sellerName)) demoThreads.set(sellerName, []);
    appendThread(id, {
      id: crypto.randomUUID(), kind: "system", author: "", mine: false, readAt: null,
      body: `You proposed a swap for “${card?.title ?? "this listing"}”.`, createdAt: swap.createdAt,
    });
    if (input.message) {
      appendThread(id, {
        id: crypto.randomUUID(), kind: "text", author: "you", body: input.message,
        mine: true, readAt: null, createdAt: swap.createdAt,
      });
    }
    return id;
  }
  const { id } = await api<{ id: string }>("/api/me/swaps", { method: "POST", body: input });
  return id;
}
