import { api, apiEnabled } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { applyDemoCredits, currentLocalUser } from "@/lib/local-account";

export type PaymentType = "topup" | "escrow_hold" | "escrow_release" | "escrow_refund" | "payout";
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type LedgerEntry = {
  id: string;
  type: PaymentType;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** Direction relative to the viewer: credits in or out. */
  credit: "in" | "out";
  from: string;
  to: string;
  gateway: "credits" | "stripe";
  gatewayRef?: string;
  receiptNo?: string;
  note?: string;
  swapId?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

export type WalletState = {
  balance: number;
  creditsHeld: number;
  paymentsConfigured: boolean;
  items: LedgerEntry[];
  total: number;
  page: number;
  pages: number;
};

export type Receipt = { payment: LedgerEntry & { counterparty?: string; swapStatus?: string | null } };

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  topup: "Credits top-up",
  escrow_hold: "Escrow held",
  escrow_release: "Escrow released",
  escrow_refund: "Escrow refunded",
  payout: "Payout",
};

/* ── Demo fallback (when the API isn't configured) ── */
const DEMO_KEY = "swapt.payments.demo";
let demoSeq = 3;

function demoLedger(): LedgerEntry[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveDemoLedger(items: LedgerEntry[]) {
  localStorage.setItem(DEMO_KEY, JSON.stringify(items));
}

/** Prepend a ledger entry to the demo wallet (used by the swap lifecycle). */
export function recordDemoLedger(entry: LedgerEntry) {
  saveDemoLedger([entry, ...demoLedger()]);
}

/** Next demo receipt number, e.g. SWPT-2026-000004. */
export function nextDemoReceiptNo(): string {
  const year = new Date().getFullYear();
  const count = demoLedger().length + 1;
  return `SWPT-${year}-${String(count).padStart(6, "0")}`;
}

function seedDemoLedger() {
  const existing = demoLedger();
  if (existing.length > 0) return existing;
  const now = Date.now();
  const seeded: LedgerEntry[] = [
    {
      id: "d1", type: "topup", status: "completed", amount: 100, currency: "credits", credit: "in",
      from: "you", to: "you", gateway: "credits", receiptNo: "SWPT-2026-000001",
      note: "Demo top-up", createdAt: new Date(now - 86400000 * 6).toISOString(),
    },
    {
      id: "d2", type: "escrow_release", status: "completed", amount: 35, currency: "credits", credit: "in",
      from: "alex", to: "you", gateway: "credits", receiptNo: "SWPT-2026-000002",
      note: "Swap completed — escrow released.", swapId: "s-demo",
      createdAt: new Date(now - 86400000 * 3).toISOString(), completedAt: new Date(now - 86400000 * 3).toISOString(),
    },
    {
      id: "d3", type: "escrow_hold", status: "pending", amount: 42, currency: "credits", credit: "out",
      from: "you", to: "sam", gateway: "credits", receiptNo: "SWPT-2026-000003",
      note: "Escrow held for swap.", swapId: "s-demo2",
      createdAt: new Date(now - 86400000).toISOString(),
    },
  ];
  saveDemoLedger(seeded);
  return seeded;
}

/** Fetch the member's wallet ledger (with a demo fallback). */
export async function fetchWallet(page = 1, limit = 20): Promise<WalletState> {
  if (!apiEnabled) {
    const items = seedDemoLedger();
    const start = (page - 1) * limit;
    const local = currentLocalUser();
    return {
      balance: local?.credits ?? 50,
      creditsHeld: local?.creditsHeld ?? 0,
      paymentsConfigured: false,
      items: items.slice(start, start + limit),
      total: items.length,
      page,
      pages: Math.max(1, Math.ceil(items.length / limit)),
    };
  }
  return api<WalletState>(`/api/payments/me/payments?page=${page}&limit=${limit}`);
}

/** Fetch a single receipt. */
export async function fetchReceipt(id: string): Promise<Receipt> {
  if (!apiEnabled) {
    const item = seedDemoLedger().find((i) => i.id === id);
    if (!item) throw new Error("Receipt not found");
    return { payment: { ...item, counterparty: item.credit === "in" ? item.from : item.to, swapStatus: "completed" } };
  }
  return api<Receipt>(`/api/payments/me/payments/${id}`);
}

/**
 * Top up credits. When Stripe is configured the response has a `checkoutUrl`
 * to redirect to; otherwise the demo credits the balance instantly.
 */
export async function topUpCredits(amount: number): Promise<{ checkoutUrl?: string; ok?: boolean; balance?: number; receiptId?: string }> {
  if (!apiEnabled) {
    const items = demoLedger();
    demoSeq += 1;
    const entry: LedgerEntry = {
      id: `d${demoSeq}`, type: "topup", status: "completed", amount, currency: "credits", credit: "in",
      from: "you", to: "you", gateway: "credits", receiptNo: `SWPT-2026-000${demoSeq}`,
      note: "Demo top-up", createdAt: new Date().toISOString(),
    };
    saveDemoLedger([entry, ...items]);
    const local = currentLocalUser();
    const base = local?.credits ?? 50;
    applyDemoCredits({ credits: base + amount });
    return { ok: true, balance: base + amount, receiptId: entry.id };
  }
  return api<{ checkoutUrl?: string; ok?: boolean; balance?: number; receiptId?: string }>("/api/payments/me/payments/topup", {
    method: "POST",
    body: { amount },
  });
}

/** Convenience hook: current member's credits + held, kept in sync with auth. */
export function useCredits() {
  const { user, refresh } = useAuth();
  return {
    credits: user?.credits ?? 0,
    creditsHeld: user?.creditsHeld ?? 0,
    refresh,
  };
}