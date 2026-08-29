import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, FileText, Loader2, Printer } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import { fetchReceipt, PAYMENT_TYPE_LABELS } from "@/lib/payments-api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/wallet/receipt/$id")({
  head: () => ({ meta: [{ title: "Receipt — Swapt" }] }),
  component: () => (
    <Protected>
      <ReceiptPage />
    </Protected>
  ),
});

function ReceiptPage() {
  const { id } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["receipt", id],
    queryFn: () => fetchReceipt(id),
    // A receipt either exists or it doesn't — retrying a 404 just leaves the
    // user staring at "Loading receipt…" for ~7s. Surface the error fast.
    retry: false,
  });
  const { n, dt, money, t } = useI18n();

  const p = data?.payment;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-2xl px-4 py-6 md:px-8 md:py-10">
        <Link to="/wallet" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to wallet
        </Link>

        {isLoading && (
          <div className="mt-10 flex items-center justify-center gap-2 text-sm text-foreground/55">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading receipt…
          </div>
        )}

        {error && (
          <div className="mt-10 rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-foreground/55">
            Couldn&apos;t load this receipt.
          </div>
        )}

        {p && (
          <div className="mt-6 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
            {/* Receipt header */}
            <div className="relative bg-gradient-to-br from-violet-600 via-violet-500 to-brand px-5 py-5 text-white sm:px-6 sm:py-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_100%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
              <div className="relative flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-white/70">Swapt receipt</p>
                  <p className="mt-1 break-all text-xl font-black tracking-tight sm:text-2xl">{p.receiptNo}</p>
                </div>
                <span className={cn("inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-sm font-bold capitalize backdrop-blur", p.status !== "completed" && "bg-white/10 text-white/80")}>
                  {p.status === "completed" ? <Check className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                  {p.status}
                </span>
              </div>
            </div>

            {/* Lines */}
            <dl className="divide-y divide-border px-4 sm:px-6">
              {[
                ["Description", PAYMENT_TYPE_LABELS[p.type]],
                ["From", p.from],
                ["To", p.to],
                ["Counterparty", p.counterparty ?? "—"],
                ["Gateway", p.gateway === "stripe" ? "Stripe" : "Credits"],
                ["Reference", p.gatewayRef ?? "—"],
                ["Swap status", p.swapStatus ?? "—"],
                ["Date", dt(p.createdAt)],
                ["Completed", p.completedAt ? dt(p.completedAt) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-start justify-between gap-4 py-3">
                  <dt className="shrink-0 text-sm text-foreground/55">{k}</dt>
                  <dd className="min-w-0 break-words text-right text-sm font-semibold">{v}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-4">
                <dt className="text-sm font-bold">Amount</dt>
                <dd className={cn("whitespace-nowrap text-lg font-black", p.credit === "in" ? "text-emerald-600" : "text-foreground")}>
                  {p.credit === "in" ? "+" : "−"}{p.currency === "credits" ? `${n(p.amount)} ${t("common.credits")}` : money(p.amount, p.currency)}
                </dd>
              </div>
            </dl>

            <div className="flex gap-2 border-t border-border px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-4">
              <button
                onClick={() => window.print()}
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold text-foreground/70 transition-colors hover:bg-muted active:bg-muted"
              >
                <Printer className="h-4 w-4" /> Print
              </button>
              <Link
                to="/wallet"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                Back to wallet
              </Link>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}