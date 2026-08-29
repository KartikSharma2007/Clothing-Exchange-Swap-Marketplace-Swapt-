// Standalone email test — run this directly, no server or DB required:
//
//   node src/scripts/testEmail.js you@example.com
//
// It loads .env the same way the server does, prints exactly what it's
// about to send, and shows you Brevo's raw response (or the raw error)
// so a delivery problem is visible immediately instead of buried in a
// signup request three layers deep.

import "dotenv/config";
import { emailEnabled, sendTestEmail } from "../utils/email.js";

const to = process.argv[2];

if (!to) {
  console.error("Usage: node src/scripts/testEmail.js you@example.com");
  process.exit(1);
}

console.log("--------------------------------------------------------");
console.log("BREVO_API_KEY set:", Boolean(process.env.BREVO_API_KEY));
console.log("BREVO_SENDER_EMAIL:", process.env.BREVO_SENDER_EMAIL || "(not set)");
console.log("emailEnabled:", emailEnabled);
console.log("Sending test email to:", to);
console.log("--------------------------------------------------------");

if (!emailEnabled) {
  console.error("\nemailEnabled is false — BREVO_API_KEY and/or BREVO_SENDER_EMAIL was not picked up.");
  console.error("Checklist:");
  console.error("  1. Is the file literally named `.env` (not `.env.txt`) inside the Backend folder?");
  console.error("  2. Does it contain: BREVO_API_KEY=xkeysib-xxxxxxxxxxxxxxxx");
  console.error("  3. Does it also contain: BREVO_SENDER_EMAIL=you@example.com (must be verified in Brevo)");
  console.error("  4. No quotes needed around the values, no trailing spaces.");
  console.error("  5. Did you restart the process after adding/editing .env? (nodemon does this automatically on save, but a plain `node` run needs a manual restart)");
  process.exit(1);
}

const ok = await sendTestEmail(to);

console.log("--------------------------------------------------------");
if (ok) {
  console.log("✅ Brevo accepted the email. Check the inbox (and spam folder) for:", to);
} else {
  console.log("❌ Send failed — see the [email] log lines above for the exact reason.");
  console.log("Most common cause: BREVO_SENDER_EMAIL isn't verified yet. Verify it at");
  console.log("https://app.brevo.com/senders/list (Brevo emails you a confirmation link —");
  console.log("click it, then retry). Once verified, Brevo can send to ANY recipient,");
  console.log("unlike Resend's sandbox mode which locks you to one address.");
}
console.log("--------------------------------------------------------");
process.exitCode = ok ? 0 : 1;
// Note: intentionally NOT calling process.exit() here — forcing an exit
// while an underlying HTTP keep-alive connection is still closing can trip
// a libuv assertion on Windows ("Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)"). Setting exitCode and letting Node drain the event
// loop naturally avoids that.