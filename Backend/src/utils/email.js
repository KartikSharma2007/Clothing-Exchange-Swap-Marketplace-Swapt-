// ---------------------------------------------------------------------------
// Brevo (formerly Sendinblue) transactional email
// ---------------------------------------------------------------------------
// Every outbound email in the app goes through this one file. Set
// BREVO_API_KEY and BREVO_SENDER_EMAIL in .env to turn it on — see
// .env.example.
//
// Get a key:            https://app.brevo.com/settings/keys/api
// Verify a sender:       https://app.brevo.com/senders/list
// ---------------------------------------------------------------------------

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "Swapt";
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || undefined;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:8080";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

/** Escape user-controlled strings for safe HTML interpolation in email templates (prevents XSS via titles/names). */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** True once BREVO_API_KEY + BREVO_SENDER_EMAIL are configured — every send* function below no-ops when false. */
export const emailEnabled = Boolean(BREVO_API_KEY && BREVO_SENDER_EMAIL);

// One-time boot diagnostic so a missing/misplaced key is obvious in the
// server log immediately, instead of discovered by a silently-missing email
// three steps into a signup flow.
if (BREVO_API_KEY && BREVO_SENDER_EMAIL) {
  const masked = BREVO_API_KEY.length > 10
    ? `${BREVO_API_KEY.slice(0, 8)}...${BREVO_API_KEY.slice(-4)}`
    : "(too short to be a real key)";
  console.log(`[email] Brevo enabled — key ${masked}, from "${BREVO_SENDER_NAME} <${BREVO_SENDER_EMAIL}>"`);
} else if (BREVO_API_KEY && !BREVO_SENDER_EMAIL) {
  console.warn("[email] BREVO_API_KEY is set but BREVO_SENDER_EMAIL is missing — emails will be skipped. Set BREVO_SENDER_EMAIL to a sender you've verified at https://app.brevo.com/senders/list");
} else {
  console.warn("[email] BREVO_API_KEY is not set — all emails will be skipped (logged to console instead). Check your .env file is in Backend/.env and the server was restarted after adding it.");
}

/**
 * Low-level send. Never throws into the request path — a broken email
 * provider should never break signup/checkout/etc. Logs failures instead.
 * Returns true on success, false otherwise (including when disabled).
 */
async function send({ to, subject, html, replyTo }) {
  if (!emailEnabled) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[email:disabled] would send "${subject}" to ${to}`);
    }
    return false;
  }
  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject,
        htmlContent: html,
        ...((replyTo || EMAIL_REPLY_TO) ? { replyTo: { email: replyTo || EMAIL_REPLY_TO } } : {}),
      }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[email] Brevo REJECTED "${subject}" -> ${to} (HTTP ${res.status}):`, JSON.stringify(body, null, 2));
      if (res.status === 401) {
        console.error("[email] ^ 401 means BREVO_API_KEY is wrong or revoked — check https://app.brevo.com/settings/keys/api");
      } else if (body?.code === "invalid_parameter" && /sender/i.test(body?.message || "")) {
        console.error(`[email] ^ The sender "${BREVO_SENDER_EMAIL}" isn't verified yet. Verify it at https://app.brevo.com/senders/list (Brevo emails you a confirmation link — click it, then retry).`);
      }
      return false;
    }

    console.log(`[email] sent "${subject}" -> ${to} (id: ${body?.messageId})`);
    return true;
  } catch (err) {
    console.error(`[email] send threw for "${subject}" -> ${to}:`, err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Accent theming — maps the 4 site themes (red/blue/green/black) to email hex
// ---------------------------------------------------------------------------
const ACCENT_HEX = {
  red: "#e0353a",
  green: "#1f9d55",
  blue: "#2563eb",
  black: "#141414",
};
function accentHex(accent) {
  const key = String(accent || "red").toLowerCase();
  return ACCENT_HEX[key] || ACCENT_HEX.red;
}

// ---------------------------------------------------------------------------
// Shared layout — every template below renders through this so the brand
// (logo mark, colors, footer) stays consistent in one place. Now accent-aware
// and more polished: top accent bar, soft shadow, rounded 24px, smooth button.
// ---------------------------------------------------------------------------

function layout({ preheader = "", heading, body, ctaLabel, ctaHref, accent = "red" }) {
  const hex = accentHex(accent);
  const year = new Date().getFullYear();
  // Soft tint for header badge — derived from accent with opacity
  const tint = hex === "#141414" ? "rgba(20,20,20,0.08)" : `${hex}12`;
  return `
  <div style="background:#f3f4f6;padding:36px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e5e7eb;box-shadow:0 12px 40px rgba(0,0,0,0.07);">
      <!-- Accent top bar - smooth -->
      <div style="height:4px;background:${hex};"></div>
      <!-- Header — table layout for perfect email-client alignment (S centered via line-height) -->
      <div style="padding:26px 32px 0 32px;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="vertical-align:middle;width:36px;">
              <div style="width:36px;height:36px;border-radius:11px;background:${hex};text-align:center;line-height:36px;color:#ffffff;font-weight:900;font-size:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 12px ${hex}30;">S</div>
            </td>
            <td style="vertical-align:middle;padding-left:12px;">
              <div style="font-size:19px;font-weight:900;letter-spacing:-0.6px;color:#111827;line-height:36px;">Swapt<span style="color:${hex}">.</span></div>
            </td>
            <td style="vertical-align:middle;text-align:right;">
              <div style="display:inline-block;background:${tint};border:1px solid ${hex}18;border-radius:999px;padding:7px 13px;font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:${hex};line-height:1;white-space:nowrap;vertical-align:middle;">Marketplace</div>
            </td>
          </tr>
        </table>
      </div>
      <!-- Body -->
      <div style="padding:22px 32px 28px 32px;color:#111827;line-height:1.65;font-size:15px;">
        <h1 style="font-size:22px;margin:10px 0 10px 0;color:#111827;font-weight:900;letter-spacing:-0.5px;line-height:1.25;">${heading}</h1>
        <div style="color:#374151;font-size:14.5px;line-height:1.65;">${body}</div>
        ${ctaHref ? `
        <div style="margin-top:26px;">
          <a href="${ctaHref}" style="display:inline-block;padding:13px 26px;background:${hex};color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:-0.1px;box-shadow:0 8px 20px ${hex}33;transition:all 0.2s;">
            ${ctaLabel} &rarr;
          </a>
          <div style="margin-top:10px;font-size:11px;color:#9ca3af;">Button not working? Copy and paste: <span style="color:#6b7280;word-break:break-all;">${ctaHref}</span></div>
        </div>` : ""}
      </div>
      <!-- Footer -->
      <div style="padding:18px 32px;background:#fafafa;border-top:1px solid #f0f0f0;color:#9ca3af;font-size:11px;line-height:1.6;">
        <p style="margin:0;">You're receiving this because it relates to your Swapt account. <a href="${CLIENT_ORIGIN}/settings" style="color:#6b7280;text-decoration:underline;">Manage preferences</a> &middot; <a href="${CLIENT_ORIGIN}/contact" style="color:#6b7280;text-decoration:underline;">Help</a></p>
        <p style="margin:8px 0 0 0;font-size:10px;letter-spacing:0.02em;color:#b0b0b0;">&copy; ${year} Swapt &middot; Clothing Exchange Marketplace &middot; All rights reserved</p>
      </div>
    </div>
    <div style="max-width:560px;margin:12px auto 0 auto;text-align:center;font-size:11px;color:#9ca3af;">
      <p style="margin:0;">This email was sent to you as a transactional update. You can mute non-essential mails in <a href="${CLIENT_ORIGIN}/settings" style="color:#6b7280;">Settings → Notifications</a>.</p>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Debug helper — used by the /api/dev/test-email route and the
// scripts/testEmail.js CLI script. Bypasses the template so you see exactly
// what Brevo does with a bare-minimum request.
// ---------------------------------------------------------------------------
export async function sendTestEmail(to) {
  return send({
    to,
    subject: "Swapt test email",
    html: `<p>This is a test email from your Swapt backend, sent at ${new Date().toISOString()}.</p><p>If you got this, Brevo is wired up correctly.</p>`,
  });
}

// ---------------------------------------------------------------------------
// Account lifecycle
// ---------------------------------------------------------------------------

/** Sent right after a member's email is verified (or immediately on signup when no verification is required). */
export async function sendWelcomeEmail(to, name, accent = "red") {
  return send({
    to,
    subject: "Welcome to Swapt 👋",
    html: layout({
      preheader: "Your account is ready — start listing and swapping.",
      heading: `Welcome, ${esc(name) || "there"}!`,
      accent,
      body: `
        <p style="margin:0 0 12px 0;">Your <strong>Swapt</strong> account is live — the clothing swap marketplace where you trade what you don't wear for what you'll love.</p>
        <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:14px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 8px 0;font-weight:700;font-size:13px;letter-spacing:0.04em;text-transform:uppercase;color:#6b7280;">Try this first</p>
          <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;">
            <tr><td style="padding:6px 0;">📸</td><td style="padding:6px 0;">List your first item with 2–3 clear photos</td></tr>
            <tr><td style="padding:6px 0;">📏</td><td style="padding:6px 0;">Add your sizes — we flag <em>likely fits you</em></td></tr>
            <tr><td style="padding:6px 0;">✅</td><td style="padding:6px 0;">Verify your phone for the trust badge</td></tr>
          </table>
        </div>
        <p style="margin:0;color:#6b7280;font-size:13px;">Tip: Your accent color is <strong style="text-transform:capitalize;color:${accentHex(accent)};">${accent}</strong> — all your mails will match it.</p>
      `,
      ctaLabel: "Go to your dashboard",
      ctaHref: `${CLIENT_ORIGIN}/dashboard`,
    }),
  });
}

export async function sendVerificationEmail(to, verifyLink, accent = "red") {
  return send({
    to,
    subject: "Verify your Swapt email",
    html: layout({
      preheader: "Confirm your email to finish creating your account.",
      heading: "Verify your email",
      accent,
      body: `
        <p style="margin:0 0 12px 0;">You're almost in — please confirm your email address to finish creating your Swapt account.</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">This link expires in <strong>24 hours</strong>. If you didn't sign up, you can safely ignore this email.</p>
      `,
      ctaLabel: "Verify my email",
      ctaHref: verifyLink,
    }),
  });
}

export async function sendPasswordResetEmail(to, resetLink, accent = "red") {
  return send({
    to,
    subject: "Reset your Swapt password",
    html: layout({
      preheader: "We received a request to reset your password.",
      heading: "Reset your password",
      accent,
      body: `
        <p style="margin:0 0 12px 0;">We received a request to reset your Swapt password. If this was you, choose a new password below.</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">This link expires in <strong>1 hour</strong>. If you didn't request this, you can safely ignore it — your password won't change.</p>
      `,
      ctaLabel: "Reset your password",
      ctaHref: resetLink,
    }),
  });
}

/** Security notice sent whenever a password actually changes (via reset flow or the logged-in change-password form). — No IP, only sensible details */
export async function sendPasswordChangedEmail(to, { method, accent } = {}) {
  const accentKey = accent || "red";
  return send({
    to,
    subject: "Your Swapt password was changed",
    html: layout({
      preheader: "Your password was just changed.",
      heading: "Your password was changed",
      accent: accentKey,
      body: `
        <p style="margin:0 0 12px 0;">This confirms your Swapt account password was changed${method ? ` via <strong>${method}</strong>` : ""}.</p>
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;margin:16px 0;">
          <p style="margin:0;font-weight:700;color:#991b1b;font-size:13px;">Wasn't you?</p>
          <p style="margin:4px 0 0 0;color:#7f1d1d;font-size:13px;">Reset your password immediately and check your account. If you need help, contact support.</p>
        </div>
        <p style="margin:0;color:#6b7280;font-size:13px;">Time: <strong>${new Date().toLocaleString()}</strong></p>
      `,
      ctaLabel: "Reset password now",
      ctaHref: `${CLIENT_ORIGIN}/forgot`,
    }),
  });
}

/** Delivery fallback for phone-verification codes when no SMS provider is configured. */
export async function sendPhoneCodeEmail(to, code, accent = "red") {
  return send({
    to,
    subject: "Your Swapt verification code",
    html: layout({
      preheader: `Your code is ${code}`,
      heading: "Your verification code",
      accent,
      body: `
        <p style="margin:0 0 12px 0;">Here's your Swapt phone-verification code:</p>
        <div style="background:${accentHex(accent)}10;border:1px solid ${accentHex(accent)}20;border-radius:16px;padding:18px;text-align:center;margin:16px 0;">
          <div style="font-size:32px;font-weight:900;letter-spacing:8px;color:${accentHex(accent)};">${code}</div>
          <div style="margin-top:6px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#6b7280;font-weight:700;">Expires in 10 minutes</div>
        </div>
        <p style="margin:0;color:#6b7280;font-size:13px;">If you didn't request it, just ignore this email.</p>
      `,
    }),
  });
}

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/** Sent when a member gets a new chat/swap message and isn't online to see the push/in-app alert. */
export async function sendNewMessageEmail(to, { fromName, body, href, accent } = {}) {
  const preview = String(body || "Sent you a photo").slice(0, 200);
  return send({
    to,
    subject: `New message from ${esc(fromName)} on Swapt`,
    html: layout({
      preheader: preview,
      heading: `${esc(fromName)} sent you a message`,
      accent: accent || "red",
      body: `
        <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:14px;padding:16px;color:#374151;font-style:italic;">
          “${preview}”
        </div>
        <p style="margin:12px 0 0 0;color:#6b7280;font-size:13px;">Reply directly in the app — you’ll get notified instantly.</p>
      `,
      ctaLabel: "Reply on Swapt",
      ctaHref: `${CLIENT_ORIGIN}${href}`,
    }),
  });
}

// ---------------------------------------------------------------------------
// Swap lifecycle — all accent-aware
// ---------------------------------------------------------------------------

export async function sendSwapRequestEmail(to, { fromName, itemTitle, swapId, accent } = {}) {
  return send({
    to,
    subject: `${esc(fromName)} wants to swap for “${esc(itemTitle)}”`,
    html: layout({
      preheader: `${fromName} sent you a swap request for ${itemTitle}.`,
      heading: `New swap request`,
      accent: accent || "red",
      body: `<p style="margin:0 0 8px 0;"><strong>${esc(fromName)}</strong> wants to swap for <strong>“${esc(itemTitle)}”</strong>.</p><p style="margin:0;color:#6b7280;font-size:13px;">Open the swap to accept, counter or decline — counters restart the 7-day window.</p>`,
      ctaLabel: "View swap request",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendSwapAcceptedEmail(to, { fromName, swapId, accent } = {}) {
  return send({
    to,
    subject: `Swap accepted 🎉 — ${esc(fromName)} accepted your swap`,
    html: layout({
      preheader: `${fromName} accepted your swap — it's locked in.`,
      heading: `Swap accepted 🎉`,
      accent: accent || "red",
      body: `<p style="margin:0;"><strong>${esc(fromName)}</strong> accepted your swap — it's now <strong>locked in</strong>. Arrange shipping or meetup, and confirm receipt to complete it.</p>`,
      ctaLabel: "View swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendSwapStatusEmail(to, { fromName, status, swapId, accent } = {}) {
  const isCompleted = status === "completed";
  const isDeclined = status === "declined";
  const isCancelled = status === "cancelled";
  const subject = isCompleted ? `Swap completed — nice work!` : isDeclined ? `Swap declined` : isCancelled ? `Swap cancelled` : `Swap ${status}`;
  const heading = isCompleted ? `Swap completed` : isDeclined ? `Swap declined` : isCancelled ? `Swap cancelled` : `Swap ${status}`;
  const body = isCompleted
    ? `<p style="margin:0;">Your swap with <strong>${esc(fromName)}</strong> is marked <strong>completed</strong>. Credits have been settled. Leave a review?</p>`
    : isDeclined
      ? `<p style="margin:0;"><strong>${esc(fromName)}</strong> declined your swap request. No credits were moved — browse similar items or propose again.</p>`
      : isCancelled
        ? `<p style="margin:0;">Your swap with <strong>${esc(fromName)}</strong> was <strong>cancelled</strong>. No credits were moved.</p>`
        : `<p style="margin:0;">Your swap with <strong>${esc(fromName)}</strong> is now <strong>${status}</strong>.</p>`;
  return send({
    to,
    subject,
    html: layout({
      preheader: subject,
      heading,
      accent: accent || "red",
      body,
      ctaLabel: "View swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendCounterOfferEmail(to, { fromName, swapId, accent } = {}) {
  return send({
    to,
    subject: `${esc(fromName)} sent you a counter-offer`,
    html: layout({
      preheader: `${fromName} sent a counter-offer — review new terms.`,
      heading: `Counter-offer received`,
      accent: accent || "red",
      body: `<p style="margin:0;"><strong>${esc(fromName)}</strong> sent you a counter-offer with new terms (note / meetup). You can accept, decline or counter again — each counter restarts the 7-day window.</p>`,
      ctaLabel: "Review counter-offer",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendMeetupUpdatedEmail(to, { fromName, place, time, swapId, accent } = {}) {
  return send({
    to,
    subject: `Meetup updated — ${esc(place) || "new place"}`,
    html: layout({
      preheader: `${fromName} updated the meetup.`,
      heading: `Meetup updated`,
      accent: accent || "red",
      body: `<p style="margin:0;"><strong>${esc(fromName)}</strong> updated the meetup${place ? ` to <strong>${place}</strong>` : ""}${time ? ` on ${new Date(time).toLocaleString()}` : ""}.</p>`,
      ctaLabel: "View swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendTrackingAddedEmail(to, { fromName, carrier, trackingNumber, swapId, accent } = {}) {
  return send({
    to,
    subject: `Your swap has shipped — ${carrier} ${trackingNumber}`,
    html: layout({
      preheader: `${fromName} shared tracking ${carrier} ${trackingNumber}.`,
      heading: `Your swap has shipped 📦`,
      accent: accent || "red",
      body: `<p style="margin:0 0 12px 0;"><strong>${esc(fromName)}</strong> shared tracking for your swap.</p><div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:12px;padding:14px;"><table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151;"><tr><td style="padding:4px 0;color:#9ca3af;width:90px;">Carrier</td><td><strong>${esc(carrier)}</strong></td></tr><tr><td style="padding:4px 0;color:#9ca3af;">Tracking</td><td style="font-family:ui-monospace,monospace;"><strong>${esc(trackingNumber)}</strong></td></tr></table></div>`,
      ctaLabel: "Track package & view swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendReceiptConfirmedEmail(to, { fromName, swapId, accent } = {}) {
  return send({
    to,
    subject: `Receipt confirmed — ${fromName} got the item`,
    html: layout({
      preheader: `${fromName} confirmed receipt — you can now mark the swap completed.`,
      heading: `Receipt confirmed ✅`,
      accent: accent || "red",
      body: `<p style="margin:0;"><strong>${esc(fromName)}</strong> confirmed they received the item. You can now mark the swap as completed to release escrow.</p>`,
      ctaLabel: "View swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendSwapExpiredEmail(to, { swapId, accent } = {}) {
  return send({
    to,
    subject: `Swap expired — request cancelled after 7 days`,
    html: layout({
      preheader: `Your pending swap expired and was cancelled.`,
      heading: `Swap request expired`,
      accent: accent || "red",
      body: `<p style="margin:0;">Your pending swap request expired after 7 days without a reply and was automatically cancelled. No credits were moved — feel free to propose again.</p>`,
      ctaLabel: "View swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendDisputeOpenedEmail(to, { fromName, reason, swapId, accent } = {}) {
  return send({
    to,
    subject: `Dispute opened — ${esc(reason)}`,
    html: layout({
      preheader: `${fromName} opened a dispute: ${reason}.`,
      heading: `Dispute opened`,
      accent: accent || "red",
      body: `<p style="margin:0;"><strong>${esc(fromName)}</strong> opened a dispute on your swap: <strong>${reason}</strong>. A moderator will review the thread and decide on escrow.</p>`,
      ctaLabel: "View swap",
      ctaHref: `${CLIENT_ORIGIN}/swaps/${swapId}`,
    }),
  });
}

export async function sendReportReceivedEmail(to, { targetLabel, reason, accent } = {}) {
  return send({
    to,
    subject: `We received your report — ${reason}`,
    html: layout({
      preheader: `Thanks for reporting ${targetLabel}. We're reviewing it.`,
      heading: `Report received`,
      accent: accent || "red",
      body: `<p style="margin:0;">Thanks for flagging <strong>${esc(targetLabel)}</strong> for <strong>${esc(reason)}</strong>. Our moderation team will review it shortly. We'll follow up if we need more info.</p>`,
      ctaLabel: "Go to dashboard",
      ctaHref: `${CLIENT_ORIGIN}/dashboard`,
    }),
  });
}

export async function sendListingStatusEmail(to, { title, status, accent } = {}) {
  const isHidden = status === "hidden";
  return send({
    to,
    subject: isHidden ? `Your listing “${title}” was hidden` : `Your listing “${title}” is now featured`,
    html: layout({
      preheader: isHidden ? `Your listing was hidden by moderation.` : `Your listing was featured.`,
      heading: isHidden ? `Listing hidden` : `Listing featured ✨`,
      accent: accent || "red",
      body: isHidden
        ? `<p style="margin:0;">Your listing <strong>“${esc(title)}”</strong> was hidden by moderation and won't appear in browse until reviewed. Contact support if you think this was a mistake.</p>`
        : `<p style="margin:0;">Your listing <strong>“${esc(title)}”</strong> is now featured and will get more visibility in browse.</p>`,
      ctaLabel: isHidden ? "Contact support" : "View listing",
      ctaHref: isHidden ? `${CLIENT_ORIGIN}/contact` : `${CLIENT_ORIGIN}/browse`,
    }),
  });
}

export async function sendUserStatusEmail(to, { status, accent } = {}) {
  const suspended = status === "suspended";
  return send({
    to,
    subject: suspended ? `Your Swapt account was suspended` : `Your Swapt account was restored`,
    html: layout({
      preheader: suspended ? `Your account was suspended.` : `Your account is active again.`,
      heading: suspended ? `Account suspended` : `Account restored`,
      accent: accent || "red",
      body: suspended
        ? `<p style="margin:0;">Your Swapt account was suspended by moderation. You won't be able to sign in or swap until it's restored. Contact support if you believe this was a mistake.</p>`
        : `<p style="margin:0;">Good news — your Swapt account was restored and is active again. Thanks for your patience.</p>`,
      ctaLabel: suspended ? "Contact support" : "Go to dashboard",
      ctaHref: suspended ? `${CLIENT_ORIGIN}/contact` : `${CLIENT_ORIGIN}/dashboard`,
    }),
  });
}

export async function sendAccountDeletedEmail(to, { username, accent } = {}) {
  return send({
    to,
    subject: `Your Swapt account was deleted`,
    html: layout({
      preheader: `Your account ${username} was deleted.`,
      heading: `Account deleted`,
      accent: accent || "red",
      body: `<p style="margin:0;">Your Swapt account <strong>${username}</strong> was deleted as requested. Your listings were removed and remaining swaps were handled. If this wasn't you, contact support immediately.</p>`,
      ctaLabel: "Contact support",
      ctaHref: `${CLIENT_ORIGIN}/contact`,
    }),
  });
}

// ---------------------------------------------------------------------------
// Support / contact form
// ---------------------------------------------------------------------------

/** Confirmation sent to the member who filed a support request. */
export async function sendContactReceivedEmail(to, { ticketId, message, accent } = {}) {
  return send({
    to,
    subject: `We got your message - ${ticketId}`,
    html: layout({
      preheader: "We received your support request.",
      heading: "We got your message",
      accent: accent || "red",
      body: `
        <p style="margin:0 0 12px 0;">Thanks for reaching out — your ticket reference is <strong>${ticketId}</strong>. Our team will get back to you by email as soon as possible.</p>
        <div style="background:#f9fafb;border:1px solid #f0f0f0;border-radius:12px;padding:14px 16px;color:#374151;margin-top:12px;">
          ${esc(String(message || "").slice(0, 400))}
        </div>
      `,
    }),
  });
}

/** Internal alert to the support inbox whenever someone files the contact form. */
export async function sendContactAdminAlertEmail({ name, email, topic, message, ticketId }) {
  if (!ADMIN_EMAIL) return false;
  return send({
    to: ADMIN_EMAIL,
    subject: `[Swapt support] ${topic || "New request"} - ${ticketId}`,
    replyTo: email,
    html: layout({
      heading: "New support request",
      accent: "red",
      body: `
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151;">
          <tr><td style="padding:4px 0;color:#9ca3af;width:90px;">Ticket</td><td>${ticketId}</td></tr>
          <tr><td style="padding:4px 0;color:#9ca3af;">Name</td><td>${esc(name) || "—"}</td></tr>
          <tr><td style="padding:4px 0;color:#9ca3af;">Email</td><td>${esc(email)}</td></tr>
          <tr><td style="padding:4px 0;color:#9ca3af;">Topic</td><td>${esc(topic || "—")}</td></tr>
        </table>
        <div style="background:#f9fafb;border-radius:12px;padding:14px 16px;color:#374151;margin-top:12px;">
          ${esc(String(message || "").slice(0, 2000))}
        </div>
      `,
    }),
  });
}
