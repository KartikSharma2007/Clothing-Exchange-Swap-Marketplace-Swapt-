import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Coins, CreditCard, FileText, Loader2, Lock, MessageCircle, Plus, Receipt as ReceiptIcon, Wallet as WalletIcon, X } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import { useCredits, fetchWallet, topUpCredits, PAYMENT_TYPE_LABELS, type LedgerEntry } from "@/lib/payments-api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useModalDialog } from "@/lib/dialog-a11y";

export const Route = createFileRoute("/wallet/")({
  head: () => ({
    meta: [
      { title: "Wallet — Swapt" },
      { name: "description", content: "Your Swapt credits balance, escrow holds and payment receipts." },
      { property: "og:title", content: "Wallet — Swapt" },
      { property: "og:description", content: "Credits balance, escrow holds and receipts." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: () => (
    <Protected>
      <WalletPage />
    </Protected>
  ),
});

const TOPUP_OPTIONS = [50, 100, 250, 500];

function WalletPage() {
  const [page, setPage] = useState(1);
  const [amount, setAmount] = useState(100);
  const [topupBusy, setTopupBusy] = useState(false);
  const [topupOpen, setTopupOpen] = useState(false);
  const { credits, creditsHeld, refresh } = useCredits();
  const { n } = useI18n();
  const topupRef = useModalDialog(topupOpen, () => setTopupOpen(false));

  const { data, isLoading } = useQuery({
    queryKey: ["wallet", page],
    queryFn: () => fetchWallet(page),
  });

  async function handleTopup() {
    setTopupBusy(true);
    try {
      const res = await topUpCredits(amount);
      if (res.checkoutUrl) {
        window.location.assign(res.checkoutUrl);
        return;
      }
      toast.success("Credits added");
      await refresh();
      setTopupOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setTopupBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1100px] px-4 py-6 md:px-8 md:py-10 max-md:px-4 max-md:py-5">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground max-md:min-h-11 max-md:rounded-full max-md:border max-md:border-border max-md:bg-card max-md:px-3.5">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl max-md:text-[26px] max-md:leading-none">Wallet</h1>
        <p className="mt-1 text-sm text-foreground/60 max-md:text-xs">Your credits, escrow holds and receipts.</p>

        <div className="mt-6 grid gap-4 lg:grid-cols-3 max-md:gap-5 max-md:mt-5">
          {/* Balance card */}
          <div className="lg:col-span-1">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-violet-500 to-brand p-6 text-white shadow-lg shadow-violet-500/25 max-md:p-5 max-md:rounded-3xl">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_100%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
              <div className="relative">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/70">
                  <Coins className="h-4 w-4" /> Available balance
                </p>
                <p className="mt-2 text-5xl font-black tracking-tight max-md:text-4xl max-md:break-words">{n(credits)}</p>
                {creditsHeld > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold backdrop-blur">
                    <Lock className="h-3.5 w-3.5" /> {n(creditsHeld)} held in escrow
                  </p>
                )}
                <button
                  onClick={() => setTopupOpen(true)}
                  className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-violet-700 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <Plus className="h-3.5 w-3.5" /> Buy credits
                </button>
              </div>
            </div>

            {!data?.paymentsConfigured && (
              <div className="mt-3 rounded-2xl border border-dashed border-border px-4 py-3 text-xs leading-relaxed text-foreground/55">
                <span className="font-bold text-foreground/70">Demo mode.</span> Payments aren&apos;t wired to a provider yet,
                so top-ups credit instantly. No real money moves.
              </div>
            )}
          </div>

          {/* Ledger */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-border bg-card max-md:rounded-3xl max-md:overflow-hidden">
              <div className="flex items-center gap-3 border-b border-border px-5 py-4 max-md:px-4 max-md:py-3.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
                  <ReceiptIcon className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-sm font-black tracking-tight">Activity</h2>
                  <p className="text-xs text-foreground/50">Ledger entries and receipts</p>
                </div>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-foreground/55">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                </div>
              ) : (data?.items ?? []).length === 0 ? (
                <div className="py-16 text-center text-sm text-foreground/55">
                  No activity yet — buy credits or finish a swap to see entries here.
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {(data?.items ?? []).map((entry) => (
                    <LedgerRow key={entry.id} entry={entry} />
                  ))}
                </ul>
              )}

              {(data?.pages ?? 1) > 1 && (
                <div className="flex items-center justify-center gap-3 border-t border-border px-5 py-3">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-lg border border-border px-3 py-2.5 text-sm min-h-11 font-bold text-foreground/70 transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-foreground/55">Page {page} of {data?.pages}</span>
                  <button
                    disabled={page >= (data?.pages ?? 1)}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-lg border border-border px-3 py-2.5 text-sm min-h-11 font-bold text-foreground/70 transition-colors hover:bg-muted disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Top-up modal */}
      {topupOpen && (
        <div
          ref={topupRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm animate-fade-in outline-none"
          role="dialog"
          aria-modal="true"
          aria-label="Buy swap credits"
        >
          <div className="relative w-full max-w-sm animate-scale-in rounded-3xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setTopupOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full p-2 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand/10 text-brand">
              <CreditCard className="h-5 w-5" />
            </span>
            <h2 className="mt-3 text-lg font-black tracking-tight">Buy swap credits</h2>
            <p className="mt-1 text-xs text-foreground/55">Pick an amount — the credits are added to your balance right away.</p>

            <div className="mt-4 grid grid-cols-4 gap-2">
              {TOPUP_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setAmount(o)}
                  className={cn(
                    "rounded-xl border px-2 py-3 text-sm font-black transition-colors",
                    amount === o ? "border-brand bg-brand/10 text-brand" : "border-border text-foreground/70 hover:border-brand/40",
                  )}
                >
                  {o}
                </button>
              ))}
            </div>

            <button
              onClick={handleTopup}
              disabled={topupBusy}
              className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {topupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WalletIcon className="h-4 w-4" />}
              {topupBusy ? "Processing…" : `Add ${amount} credits`}
            </button>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const positive = entry.credit === "in";
  const { n, d } = useI18n();
  const partyLabel =
    entry.type === "topup" ? "from Swapt" : positive ? `from @${entry.from}` : `to @${entry.to}`;
  const settled = entry.status === "completed" || entry.status === "refunded";

  return (
    <li className="flex items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/40 max-md:px-4 max-md:py-3.5 max-md:gap-3">
      <span
        className={cn(
          "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          entry.status === "pending" ? "bg-amber-500/10 text-amber-600" : positive ? "bg-emerald-500/10 text-emerald-600" : "bg-foreground/5 text-foreground/70",
        )}
      >
        {entry.type === "topup" ? <Plus className="h-4 w-4" /> : entry.status === "pending" ? <Lock className="h-4 w-4" /> : <Coins className="h-4 w-4" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{PAYMENT_TYPE_LABELS[entry.type]}</p>
          {entry.status === "pending" && (
            <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold uppercase text-amber-600">pending</span>
          )}
          {entry.status === "refunded" && (
            <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold uppercase text-rose-600">refunded</span>
          )}
          {entry.status === "failed" && (
            <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-bold uppercase text-rose-600">failed</span>
          )}
          <span className={cn("ml-auto text-sm font-black sm:hidden", entry.status === "pending" ? "text-amber-600" : positive ? "text-emerald-600" : "text-foreground/70")}>
            {positive ? "+" : "−"}{n(entry.amount)}
          </span>
        </div>

        <p className="mt-0.5 truncate text-xs text-foreground/60">{partyLabel}</p>

        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-foreground/45">
          <span>{d(entry.createdAt)}</span>
          {settled && entry.completedAt && <span>settled {d(entry.completedAt)}</span>}
          {entry.receiptNo && <span className="font-mono">{entry.receiptNo}</span>}
          {entry.swapId && (
            <Link
              to="/swaps/$id"
              params={{ id: entry.swapId }}
              className="inline-flex items-center gap-1 rounded-md font-semibold text-foreground/55 transition-colors hover:text-brand"
            >
              <MessageCircle className="h-3 w-3" /> View swap
            </Link>
          )}
        </div>

        {entry.note && <p className="mt-1 line-clamp-1 text-xs italic text-foreground/40">{entry.note}</p>}
      </div>

      {entry.receiptNo && (
        <Link
          to="/wallet/receipt/$id"
          params={{ id: entry.id }}
          aria-label={`Receipt ${entry.receiptNo}`}
          className="shrink-0 rounded-lg border border-border p-1.5 text-foreground/45 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <FileText className="h-3.5 w-3.5" />
        </Link>
      )}

      <span className={cn("hidden shrink-0 text-sm font-black sm:block", entry.status === "pending" ? "text-amber-600" : positive ? "text-emerald-600" : "text-foreground/70")}>
        {positive ? "+" : "−"}{n(entry.amount)}
      </span>
    </li>
  );
}