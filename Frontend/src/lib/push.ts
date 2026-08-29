import { api, apiEnabled } from "@/lib/api";

/**
 * Web Push (VAPID) helpers. Push needs HTTPS (or localhost) plus a public VAPID
 * key from the server — both only exist in a real deployment, so every call
 * here fails gracefully and the UI just hides push when it's unavailable.
 */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function pushSupported() {
  return Boolean(apiEnabled && VAPID_PUBLIC_KEY && "serviceWorker" in navigator && "PushManager" in window);
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return new Uint8Array([...raw].map((c) => c.charCodeAt(0)));
}

/** Register the service worker (idempotent). */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

/** Whether the current browser already has a push subscription we manage. */
export async function hasPushSubscription(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    // Use getRegistration on read path — don't register a SW just to check (avoids network + 404 noise when /sw.js missing)
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.getRegistration("/")) ?? null;
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return Boolean(sub);
  } catch {
    return false;
  }
}

/** Ask for permission, subscribe, and register the subscription with the server. */
export async function enablePush(): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    const reg = await ensureServiceWorker();
    if (!reg) return false;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToUint8Array(VAPID_PUBLIC_KEY as string),
      });
    }
    const keys = sub.toJSON().keys;
    if (!keys?.p256dh || !keys.auth) return false;
    await api("/api/me/push-subscriptions", {
      method: "POST",
      body: { endpoint: sub.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    });
    return true;
  } catch {
    return false;
  }
}

/** Remove our push subscription (both browser and server records). */
export async function disablePush(): Promise<void> {
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.getRegistration("/")) ?? null;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await api("/api/me/push-subscriptions", { method: "DELETE", body: { endpoint: sub.endpoint } }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
  } catch {
    /* best effort */
  }
}
