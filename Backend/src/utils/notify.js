import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { emailEnabled, sendNewMessageEmail } from "./email.js";

/**
 * Notification kinds that count as "swap activity" — the member can switch
 * these off entirely via the Settings → Notifications "Swap activity" toggle.
 */
export const SWAP_ALERT_KINDS = new Set(["swap_request", "swap_accepted", "swap_match"]);

/**
 * Notification kinds that also get emailed (in addition to the in-app bell +
 * push) when the member has "Email updates" turned on in Settings. Kept to a
 * short list — nobody wants an email for every like/follow.
 */
const EMAILED_KINDS = new Set(["message"]);

/**
 * Create a notification for `userId`, suppressing it if:
 *  - `userId` has muted the `actor` (or themselves is the actor), or
 *  - `userId` has turned off "Swap activity" and this is a swap-kind alert.
 * Also fires a transactional email for kinds in EMAILED_KINDS when the
 * member has email notifications enabled. Returns true if it was delivered.
 */
export async function notify(userId, input) {
  if (!userId) return false;
  const actorId = input.actor ? String(input.actor) : null;
  const target = await User.findById(userId).select("mutedUsers swapAlerts blockedUsers email emailUpdates displayName username accent").lean();
  if (!target) return false;
  if (actorId && String(userId) !== actorId) {
    // Blocked actors are silent — the member deliberately cut this person off.
    if ((target.blockedUsers ?? []).some((b) => String(b) === actorId)) return false;
    // Muted — don't disturb.
    if ((target.mutedUsers ?? []).some((m) => String(m) === actorId)) return false;
  }
  // Swap-activity alerts are fully suppressed when the member opted out — this
  // also stops the paired push (`notify()`'s callers only push when it returns
  // true), so the bell badge and push notifications both respect the toggle.
  if (SWAP_ALERT_KINDS.has(input.kind) && target.swapAlerts === false) {
    return false;
  }
  await Notification.create({ user: userId, ...input });

  // Fire-and-forget email for the kinds that warrant one. Never blocks or
  // fails the notification itself — a broken email provider shouldn't break
  // in-app notifications.
  if (emailEnabled && target.email && target.emailUpdates !== false && EMAILED_KINDS.has(input.kind)) {
    if (input.kind === "message") {
      const fromName = input.title?.replace(/^New message from /, "") || "Someone";
      void sendNewMessageEmail(target.email, { fromName, body: input.body, href: input.href || "/messages", accent: target.accent || "red" }).catch(() => {});
    }
  }

  return true;
}