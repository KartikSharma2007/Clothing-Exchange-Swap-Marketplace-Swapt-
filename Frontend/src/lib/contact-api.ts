import { api, apiEnabled } from "@/lib/api";

export type ContactInput = {
  name?: string;
  email: string;
  topic?: string;
  message: string;
};

export type ContactResult = { ok: boolean; ticketId: string };

/**
 * File a support request. When the API isn't configured (demo mode) we
 * simulate a ticket so the page still works end-to-end.
 */
export async function sendContactMessage(input: ContactInput): Promise<ContactResult> {
  if (!apiEnabled) {
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true, ticketId: `SWPT-${Math.random().toString(36).slice(2, 6).toUpperCase()}` };
  }
  return api<ContactResult>("/api/contact", { method: "POST", auth: false, body: input });
}