import webpush from "web-push";
import { PushSubscription } from "../models/PushSubscription.js";

/**
 * Web Push (VAPID) delivery. Every send is best-effort: in local dev there's no
 * HTTPS push service reachable, so failures are logged and swallowed rather than
 * taking down the request that triggered them.
 */
const vapidKeys = () => ({
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT || "mailto:swapt@example.com",
});

/** True when VAPID keys are configured so the push service can be used. */
export function pushConfigured() {
  const { publicKey, privateKey } = vapidKeys();
  return Boolean(publicKey && privateKey);
}

/** Send a push to one subscription. Resolves false if it 410'd (expired). */
async function sendOne(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
    );
    return true;
  } catch (err) {
    if (err && (err.statusCode === 410 || err.statusCode === 404)) {
      return false; // subscription is dead — caller should prune it
    }
    console.warn("push failed", err.message || err);
    return true; // transient failure, keep the subscription
  }
}

/**
 * Deliver `payload` to every valid subscription for `userId`. Expired
 * subscriptions are removed. Always resolves (never rejects).
 */
export async function pushToUser(userId, payload) {
  if (!pushConfigured()) return;
  try {
    const subs = await PushSubscription.find({ user: userId });
    if (!subs.length) return;
    const results = await Promise.all(subs.map((s) => sendOne(s, payload)));
    const dead = subs.filter((_, i) => results[i] === false);
    if (dead.length) {
      await PushSubscription.deleteMany({ _id: { $in: dead.map((d) => d._id) } });
    }
  } catch (err) {
    console.warn("push sweep failed", err.message || err);
  }
}
