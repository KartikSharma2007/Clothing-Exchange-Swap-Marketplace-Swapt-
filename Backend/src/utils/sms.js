import twilio from "twilio";

// ---------------------------------------------------------------------------
// Twilio SMS
// ---------------------------------------------------------------------------
// Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_PHONE_NUMBER in .env to
// turn this on — see .env.example. Without them, `smsEnabled` is false and
// callers fall back to email delivery (see routes/me.routes.js phone/verify).
//
// Get credentials:      https://console.twilio.com
// Buy/verify a sender:  https://console.twilio.com/us1/develop/phone-numbers/manage/incoming
// Trial accounts can only text numbers you've verified in the console.
// ---------------------------------------------------------------------------

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;
// Optional: use a Twilio Messaging Service SID instead of a single number
// (handles number rotation / A2P registration for you) — if set, it wins.
const TWILIO_MESSAGING_SERVICE_SID = process.env.TWILIO_MESSAGING_SERVICE_SID;

const client = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : null;

/** True once Twilio credentials + a sender (number or messaging service) are configured. */
export const smsEnabled = Boolean(client && (TWILIO_PHONE_NUMBER || TWILIO_MESSAGING_SERVICE_SID));

/**
 * Send a raw SMS. Never throws into the request path — logs and returns
 * false on failure so callers can fall back to another delivery channel.
 */
export async function sendSMS(to, body) {
  if (!smsEnabled) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[sms:disabled] would text "${body}" to ${to}`);
    }
    return false;
  }
  const phone = normalizePhone(to);
  if (!phone) {
    console.error("[sms] invalid destination number:", to);
    return false;
  }
  try {
    await client.messages.create({
      to: phone,
      body,
      ...(TWILIO_MESSAGING_SERVICE_SID
        ? { messagingServiceSid: TWILIO_MESSAGING_SERVICE_SID }
        : { from: TWILIO_PHONE_NUMBER }),
    });
    return true;
  } catch (err) {
    console.error("[sms] send failed:", err.message);
    return false;
  }
}

/** Phone-verification code, formatted for a text message. */
export async function sendPhoneVerificationSMS(to, code) {
  return sendSMS(to, `Your Swapt verification code is ${code}. It expires in 10 minutes. Don't share this code with anyone.`);
}

/**
 * Best-effort E.164 normalization. Twilio requires E.164 (e.g. +14155552671).
 * If the number already has a leading "+" we trust it as-is; otherwise this
 * assumes an Indian mobile number (10 digits) since that's this project's
 * primary market — adjust the default country code if you target elsewhere.
 */
function normalizePhone(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d+]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+91${digits}`; // bare 10-digit Indian mobile number
  if (digits.length > 10) return `+${digits}`; // already has a country code, just missing "+"
  return null;
}