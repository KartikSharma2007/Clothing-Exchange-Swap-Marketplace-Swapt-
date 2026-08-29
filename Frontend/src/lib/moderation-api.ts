import { api, apiEnabled } from "@/lib/api";
import { listings as mockListings } from "@/lib/mock-listings";

// ---- Reports (user + listing) ----

export type ReportTargetType = "listing" | "user";

export type AdminReport = {
  id: string;
  targetType: ReportTargetType;
  reason: string;
  details: string;
  status: "open" | "resolved";
  reporter: string;
  target: {
    id: string;
    title?: string;
    status?: string;
    seller?: string;
    username?: string;
    name?: string;
  } | null;
  resolvedBy: string | null;
  resolutionNote: string;
  createdAt: string;
};

// ---- demo reports store (no VITE_API_URL) ----
const DEMO_REPORTS_KEY = "swapt.reports.demo";

function seedReports(): AdminReport[] {
  const seed = (): AdminReport[] => {
    const now = Date.now();
    const [listing1, listing2] = mockListings;
    return [
      {
        id: "rep_1",
        targetType: "listing",
        reason: "counterfeit",
        details: "Badge stitching looks off compared to the retail version.",
        status: "open",
        reporter: "mira.k",
        target: { id: listing1?.id ?? "l1", title: listing1?.title ?? "Listing", status: "active", seller: "sophia" },
        resolvedBy: null,
        resolutionNote: "",
        createdAt: new Date(now - 2 * 86400000).toISOString(),
      },
      {
        id: "rep_2",
        targetType: "user",
        reason: "harassment",
        details: "Sent repeated aggressive messages after I declined the swap.",
        status: "open",
        reporter: "ali.h",
        target: { id: "u_demo2", username: "noah_w", name: "Noah Wright", status: "active" },
        resolvedBy: null,
        resolutionNote: "",
        createdAt: new Date(now - 86400000).toISOString(),
      },
      {
        id: "rep_3",
        targetType: "listing",
        reason: "misleading",
        details: "Listed as 'like new' but arrived with visible wear on the cuffs.",
        status: "resolved",
        reporter: "sofia.l",
        target: { id: listing2?.id ?? "l2", title: listing2?.title ?? "Listing", status: "active", seller: "kenji" },
        resolvedBy: "admin",
        resolutionNote: "Photos reviewed; condition updated.",
        createdAt: new Date(now - 5 * 86400000).toISOString(),
      },
    ];
  };
  try {
    const raw = localStorage.getItem(DEMO_REPORTS_KEY);
    if (raw) return JSON.parse(raw) as AdminReport[];
  } catch {
    /* fall through to reseed */
  }
  const seeded = seed();
  localStorage.setItem(DEMO_REPORTS_KEY, JSON.stringify(seeded));
  return seeded;
}

function saveReports(rows: AdminReport[]) {
  localStorage.setItem(DEMO_REPORTS_KEY, JSON.stringify(rows));
}

export async function fetchAdminReports(opts: {
  status?: "open" | "resolved" | "all";
  type?: ReportTargetType | "all";
  page?: number;
}): Promise<{ items: AdminReport[]; total: number; page: number; pages: number }> {
  if (!apiEnabled) {
    const rows = seedReports().filter(
      (r) =>
        (opts.status === "all" || r.status === opts.status) &&
        (opts.type === "all" || r.targetType === opts.type),
    );
    return { items: rows, total: rows.length, page: opts.page ?? 1, pages: 1 };
  }
  const qs = new URLSearchParams();
  qs.set("status", opts.status ?? "open");
  qs.set("type", opts.type ?? "all");
  qs.set("page", String(opts.page ?? 1));
  return api(`/api/admin/reports?${qs.toString()}`);
}

export async function resolveReport(
  id: string,
  input: { note?: string; action?: "none" | "hide_listing" | "delete_listing" | "suspend_user" },
): Promise<{ ok: boolean }> {
  if (!apiEnabled) {
    const rows = seedReports();
    const report = rows.find((r) => r.id === id);
    if (report) {
      report.status = "resolved";
      report.resolvedBy = "you";
      report.resolutionNote = input.note ?? "";
      const action = input.action ?? "none";
      if (action === "hide_listing" && report.targetType === "listing" && report.target) {
        report.target = { ...report.target, status: "hidden" };
      } else if (action === "delete_listing" && report.targetType === "listing" && report.target) {
        report.target = { ...report.target, status: "deleted" };
      } else if (action === "suspend_user" && report.target) {
        // A listing report targets the seller — suspending is reflected on
        // the same target so the queue stays honest.
        report.target = { ...report.target, status: "suspended" };
      }
      saveReports(rows);
    }
    return { ok: true };
  }
  return api(`/api/admin/reports/${id}/resolve`, { method: "PATCH", body: input });
}

// ---- Disputes ----

export const DISPUTE_REASONS = [
  "Item not received",
  "Item not as described",
  "Damaged in transit",
  "Counterfeit / fake",
  "No-show",
  "Harassment",
  "Other",
] as const;

export type DisputeOutcome = "none" | "refund_requester" | "release_owner";

export type EvidenceFile = {
  publicId: string;
  url: string | null;
  width: number;
  height: number;
  bytes: number;
  by?: string | null;
  caption?: string;
  createdAt: string;
};

export type DisputeTimelineEntry = {
  at: string;
  actor: string;
  action: string;
  note: string;
};

export type SwapDispute = {
  id: string;
  reason: string;
  description: string;
  status: "open" | "resolved";
  openedBy: string;
  resolutionNote: string;
  outcome: DisputeOutcome;
  createdAt: string;
  evidence: EvidenceFile[];
  timeline: DisputeTimelineEntry[];
};

export type AdminDispute = {
  id: string;
  swapId: string;
  swapStatus: string;
  reason: string;
  description: string;
  status: "open" | "resolved";
  openedBy: string;
  listingTitle: string | null;
  participants: string[];
  resolutionNote: string;
  outcome: DisputeOutcome;
  resolvedBy: string | null;
  createdAt: string;
  escrow: { amount: number; status: string; receiptNo?: string } | null;
  evidence: EvidenceFile[];
  timeline: DisputeTimelineEntry[];
};

// ---- demo store (no VITE_API_URL) ----
const DEMO_DISPUTES_KEY = "swapt.disputes.demo";
let demoDisputeSeq = 1;

function demoDisputes(): Record<string, SwapDispute> {
  try {
    return JSON.parse(localStorage.getItem(DEMO_DISPUTES_KEY) || "{}") as Record<string, SwapDispute>;
  } catch {
    return {};
  }
}

function saveDemoDisputes(map: Record<string, SwapDispute>) {
  localStorage.setItem(DEMO_DISPUTES_KEY, JSON.stringify(map));
}

function demoAdminList(): AdminDispute[] {
  const map = demoDisputes();
  return Object.values(map).map((d) => ({
    id: d.id,
    swapId: d.id === "d1" ? "s1" : "s2",
    swapStatus: d.status === "resolved" ? "completed" : "accepted",
    reason: d.reason,
    description: d.description,
    status: d.status,
    openedBy: d.openedBy,
    listingTitle: "Vintage denim jacket",
    participants: ["mira.k", "you"],
    resolutionNote: d.resolutionNote,
    outcome: d.outcome,
    resolvedBy: d.status === "resolved" ? "admin" : null,
    createdAt: d.createdAt,
    escrow: d.status === "open" ? { amount: 35, status: "pending" } : null,
    evidence: d.evidence,
    timeline: d.timeline,
  }));
}

function seedDemoDispute(swapId: string): SwapDispute {
  const map = demoDisputes();
  if (map[swapId]) return map[swapId];
  const now = Date.now();
  const d: SwapDispute = {
    id: `dispute-${demoDisputeSeq++}`,
    reason: "Item not as described",
    description: "The jacket arrived with a visible rip that wasn't in the photos.",
    status: "open",
    openedBy: "you",
    resolutionNote: "",
    outcome: "none",
    createdAt: new Date(now - 86400000).toISOString(),
    evidence: [],
    timeline: [{ at: new Date(now - 86400000).toISOString(), actor: "you", action: "opened", note: "Item not as described — The jacket arrived with a visible rip that wasn't in the photos." }],
  };
  map[swapId] = d;
  saveDemoDisputes(map);
  return d;
}

export async function openSwapDispute(swapId: string, input: { reason: string; description: string }) {
  if (!apiEnabled) {
    const d = seedDemoDispute(swapId);
    d.reason = input.reason;
    d.description = input.description;
    d.timeline.push({ at: new Date().toISOString(), actor: "you", action: "opened", note: input.reason });
    saveDemoDisputes(demoDisputes());
    return { dispute: d };
  }
  return api<{ dispute: SwapDispute }>(`/api/me/swaps/${swapId}/disputes`, { method: "POST", body: input });
}

export async function fetchSwapDisputes(swapId: string): Promise<{ items: SwapDispute[] }> {
  if (!apiEnabled) return { items: [seedDemoDispute(swapId)] };
  return api(`/api/me/swaps/${swapId}/disputes`);
}

/** Upload evidence images (FormData: field "evidence", up to 6 images). */
export async function uploadDisputeEvidence(
  swapId: string,
  disputeId: string,
  files: File[],
): Promise<{ evidence: EvidenceFile[]; timeline: DisputeTimelineEntry[] }> {
  if (!apiEnabled) {
    const map = demoDisputes();
    const d = map[disputeId] ?? seedDemoDispute(swapId);
    for (const f of files) {
      d.evidence.push({
        publicId: `demo-evidence-${demoDisputeSeq++}`,
        url: URL.createObjectURL(f),
        width: 0,
        height: 0,
        bytes: f.size,
        by: "you",
        createdAt: new Date().toISOString(),
      });
    }
    d.timeline.push({ at: new Date().toISOString(), actor: "you", action: "evidence_added", note: `Uploaded ${files.length} photo(s).` });
    map[d.id] = d;
    saveDemoDisputes(map);
    return { evidence: d.evidence, timeline: d.timeline };
  }
  const form = new FormData();
  files.forEach((f) => form.append("evidence", f));
  return api(`/api/me/swaps/${swapId}/disputes/${disputeId}/evidence`, { method: "POST", body: form });
}

export async function fetchAdminDisputes(opts: {
  status?: "open" | "resolved" | "all";
  page?: number;
}): Promise<{ items: AdminDispute[]; total: number; page: number; pages: number }> {
  if (!apiEnabled) {
    seedDemoDispute("s1");
    const all = demoAdminList().filter((d) => opts.status === "all" || d.status === opts.status);
    return { items: all, total: all.length, page: opts.page ?? 1, pages: 1 };
  }
  const qs = new URLSearchParams();
  qs.set("status", opts.status ?? "open");
  qs.set("page", String(opts.page ?? 1));
  return api(`/api/admin/disputes?${qs.toString()}`);
}

export async function resolveDispute(
  id: string,
  input: { note?: string; outcome?: DisputeOutcome },
): Promise<{ ok: boolean }> {
  if (!apiEnabled) {
    const map = demoDisputes();
    const d = Object.values(map).find((x) => x.id === id);
    if (d) {
      d.status = "resolved";
      d.resolutionNote = input.note ?? "";
      d.outcome = input.outcome ?? "none";
      d.timeline.push({
        at: new Date().toISOString(),
        actor: "admin",
        action: "resolved",
        note: `${input.note ?? "Resolved"} — ${input.outcome === "refund_requester" ? "credits refunded to requester" : input.outcome === "release_owner" ? "credits released to owner" : "no credits moved"}.`,
      });
      saveDemoDisputes(map);
    }
    return { ok: true };
  }
  return api(`/api/admin/disputes/${id}/resolve`, { method: "PATCH", body: input });
}

export async function reportTarget(input: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string;
}): Promise<{ success: boolean }> {
  return api("/api/me/reports", { method: "POST", body: input });
}

// ---- Mutes ----

export async function fetchMutedUsers(): Promise<{ items: { username: string; displayName: string }[] }> {
  return api("/api/me/mutes");
}

export async function muteUser(username: string): Promise<{ muted: boolean }> {
  return api("/api/me/mutes", { method: "POST", body: { username } });
}

export async function unmuteUser(username: string): Promise<{ muted: boolean }> {
  return api(`/api/me/mutes/${encodeURIComponent(username)}`, { method: "DELETE" });
}

// ---- Phone verification ----

export async function requestPhoneCode(): Promise<{ ok: boolean; devCode?: string }> {
  return api("/api/me/phone/verify", { method: "POST" });
}

export async function confirmPhoneCode(code: string): Promise<{ ok: boolean; phoneVerified: boolean }> {
  return api("/api/me/phone/confirm", { method: "POST", body: { code } });
}

// ---- Dispute chat (separate from swap chat) ----
export type DisputeMessage = { id: string; body: string; image?: string | null; author: string; mine: boolean; createdAt: string };

const DISPUTE_CHAT_KEY = "swapt.dispute-chat.demo";

function readDisputeChat(): Record<string, DisputeMessage[]> {
  try { return JSON.parse(localStorage.getItem(DISPUTE_CHAT_KEY) || "{}"); } catch { return {}; }
}
function writeDisputeChat(map: Record<string, DisputeMessage[]>) {
  localStorage.setItem(DISPUTE_CHAT_KEY, JSON.stringify(map));
}

export async function fetchDisputeMessages(swapId: string, disputeId: string): Promise<{ items: DisputeMessage[] }> {
  if (!apiEnabled) {
    const map = readDisputeChat();
    const key = `${swapId}:${disputeId}`;
    if (!map[key]) {
      map[key] = [
        { id: "dm1", body: "Hello, the item arrived with a rip not shown in photos. Can we resolve?", author: "you", mine: true, createdAt: new Date(Date.now() - 86400000).toISOString() },
        { id: "dm2", body: "Thanks for flagging — can you upload a close-up of the damage? We'll review with the other party.", author: "moderator", mine: false, createdAt: new Date(Date.now() - 43200000).toISOString() },
      ];
      writeDisputeChat(map);
    }
    return { items: map[key] };
  }
  return api(`/api/me/swaps/${swapId}/disputes/${disputeId}/messages`);
}

export async function sendDisputeMessage(swapId: string, disputeId: string, body: string, image?: File | null): Promise<{ message: DisputeMessage }> {
  if (!apiEnabled) {
    const map = readDisputeChat();
    const key = `${swapId}:${disputeId}`;
    const msg: DisputeMessage = { id: crypto.randomUUID(), body, author: "you", mine: true, createdAt: new Date().toISOString(), image: image ? URL.createObjectURL(image) : null };
    map[key] = [...(map[key] ?? []), msg];
    writeDisputeChat(map);
    return { message: msg };
  }
  if (image) {
    const form = new FormData();
    form.append("image", image);
    if (body.trim()) form.append("body", body);
    return api(`/api/me/swaps/${swapId}/disputes/${disputeId}/messages`, { method: "POST", body: form });
  }
  return api(`/api/me/swaps/${swapId}/disputes/${disputeId}/messages`, { method: "POST", body: { body } });
}

export { apiEnabled };
