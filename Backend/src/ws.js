import { WebSocketServer } from "ws";
import { verifyAccessToken } from "./middleware/auth.js";
import { User } from "./models/User.js";
import { Swap } from "./models/Swap.js";

/**
 * Real-time swap events over WebSocket.
 *
 * Clients connect to /ws carrying their access token as the WebSocket
 * subprotocol (the Sec-WebSocket-Protocol header). Using a header instead of a
 * URL query string keeps the token out of access logs, browser history and
 * Referer headers. After the handshake we map the socket to its user, then push
 * lightweight "data changed" events for any swap the user is a participant in.
 * The client refetches that swap's thread, so messages/status stay correct and
 * per-user (read receipts etc.).
 */
const clients = new Map(); // userId -> Set<socket>

/** A member may keep this many tabs/sockets open at once; beyond that the
 *  oldest sockets are closed (clients auto-reconnect, freeing a slot). */
const MAX_SOCKETS_PER_USER = 5;
/** Hard ceiling on total live sockets so a flood of distinct users can't
 *  exhaust memory. New connections are refused with a 1013 "try again later". */
const MAX_TOTAL_SOCKETS = 20000;

let totalSockets = 0;

function addClient(userId, socket) {
  let set = clients.get(userId);
  if (!set) { set = new Set(); clients.set(userId, set); }
  set.add(socket);
  totalSockets += 1;

  if (set.size > MAX_SOCKETS_PER_USER) {
    // Close the oldest sockets beyond the cap — the browser reconnects.
    const oldest = [...set].slice(0, set.size - MAX_SOCKETS_PER_USER);
    for (const old of oldest) {
      set.delete(old);
      totalSockets = Math.max(0, totalSockets - 1);
      try { old.close(4008, "too many connections"); } catch { /* already closed */ }
    }
  }
}

function removeClient(userId, socket) {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(socket);
  totalSockets = Math.max(0, totalSockets - 1);
  if (set.size === 0) clients.delete(userId);
}

/** Send a small frame to every socket a member has open right now. */
function relayToUser(userId, payload) {
  const frame = JSON.stringify(payload);
  for (const s of clients.get(String(userId)) ?? []) {
    if (s.readyState === 1) {
      try { s.send(frame); } catch { /* drop for unresponsive client */ }
    }
  }
}

/** Attach the WebSocket server to the running HTTP server. */
export function attachWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    // The client offers exactly one subprotocol: its access token. Echo it so
    // the browser accepts the handshake; the connection handler then verifies
    // it. No subprotocol → the handshake is rejected.
    handleProtocols: (protocols) => protocols.values().next().value ?? false,
  });
  wss.on("error", (err) => {
    // Prevent unhandled 'error' crash when HTTP server fails to bind (EADDRINUSE)
    console.error("[ws] error:", err.message);
  });

  wss.on("connection", async (socket) => {
    try {
      // `socket.protocol` is the negotiated subprotocol (= the access token).
      const token = socket.protocol;
      if (!token) throw new Error("missing token");

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub);
      if (!user || user.status === "suspended" || user.deletedAt) throw new Error("forbidden");

      const userId = String(user._id);
      socket.userId = userId;

      if (totalSockets >= MAX_TOTAL_SOCKETS) {
        socket.close(1013, "server at capacity");
        return;
      }
      addClient(userId, socket);

      socket.on("close", () => removeClient(userId, socket));
      socket.on("error", () => removeClient(userId, socket));

      // Client-authored frames. Currently only typing indicators, which we
      // forward to the counterparty's sockets (from = this user). Nothing here
      // is trusted as data — the receiver refetches the API for the real state.
      socket.on("message", async (raw) => {
        let frame;
        try { frame = JSON.parse(String(raw)); } catch { return; }
        // Only relay a typing indicator when the sender is actually a
        // participant of the swap and the target is their counterparty —
        // otherwise a member could push frames to arbitrary users.
        if (frame?.type === "typing" && frame?.to && typeof frame.swapId === "string") {
          try {
            const swap = await Swap.findById(frame.swapId).select("requester owner");
            if (!swap) return;
            const requesterId = String(swap.requester?._id ?? swap.requester);
            const ownerId = String(swap.owner?._id ?? swap.owner);
            if (requesterId !== userId && ownerId !== userId) return;
            if (String(frame.to) !== requesterId && String(frame.to) !== ownerId) return;
            const counterpartyId = requesterId === userId ? ownerId : requesterId;
            if (String(frame.to) !== counterpartyId) return;
            relayToUser(frame.to, {
              type: "typing",
              swapId: frame.swapId,
              from: userId,
              typing: Boolean(frame.typing),
            });
          } catch { /* drop malformed frame */ }
        }
      });
    } catch {
      try { socket.close(4001, "unauthorized"); } catch { /* already closed */ }
    }
  });
}

/**
 * Tell both participants of a swap that something changed. The payload is
 * intentionally small — the client refetches the thread from the API.
 */
export function publishSwap(swap, event) {
  const ownerId = String(swap.owner?._id ?? swap.owner);
  const requesterId = String(swap.requester?._id ?? swap.requester);
  const payload = JSON.stringify({ ...event, swapId: String(swap._id) });

  for (const uid of new Set([ownerId, requesterId])) {
    for (const s of clients.get(uid) ?? []) {
      if (s.readyState === 1) {
        try { s.send(payload); } catch { /* drop for unresponsive client */ }
      }
    }
  }
}
