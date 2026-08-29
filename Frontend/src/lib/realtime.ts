import { API_URL, getAccessToken } from "@/lib/api";

/**
 * Tiny real-time client. Connects one WebSocket to the API (authenticated with
 * the access token) and fans lightweight swap events out to subscribers. The
 * chat screen uses this to refetch a thread the instant something changes.
 */

export type SwapEvent = {
  type: string;
  swapId?: string;
  status?: string;
  /** Typing frames: the member currently typing (relayed by the backend). */
  from?: string;
  to?: string;
  typing?: boolean;
  /** Read receipts: who read and when. */
  by?: string;
  at?: string;
};
type Listener = (event: SwapEvent) => void;

let socket: WebSocket | null = null;
const listeners = new Set<Listener>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

export function realtimeOpen() {
  return Boolean(socket && socket.readyState === WebSocket.OPEN);
}

export function connectRealtime() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  const token = getAccessToken();
  if (!token) return;
  const base = API_URL.replace(/^http/, "ws");

  try {
    // The access token travels as the WebSocket subprotocol (a request header),
    // never in the URL — so it can't leak into history, logs or Referer.
    socket = new WebSocket(`${base}/ws`, token);
  } catch {
    socket = null;
    return;
  }

  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data as string) as SwapEvent;
      listeners.forEach((fn) => fn(data));
    } catch {
      /* ignore malformed frames */
    }
  };
  socket.onerror = () => {
    try { socket?.close(); } catch { /* noop */ }
  };
  socket.onclose = () => {
    socket = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connectRealtime, 8000);
  };
}

export function subscribeRealtime(fn: Listener): () => void {
  connectRealtime();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Send a small client-authored frame up the socket (best-effort; the backend
 *  relays typing indicators between members, everything else it ignores). */
export function sendRealtime(frame: Record<string, unknown>) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return false;
  try {
    socket.send(JSON.stringify(frame));
    return true;
  } catch {
    return false;
  }
}

/** Tell the counterparty on `swapId` whether the local member is typing. */
export function sendTyping(swapId: string, toUserId: string | null | undefined, typing: boolean) {
  if (!toUserId) return;
  sendRealtime({ type: "typing", swapId, to: toUserId, typing });
}
