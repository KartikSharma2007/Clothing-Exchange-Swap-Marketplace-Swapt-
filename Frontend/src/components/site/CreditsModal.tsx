import { Link } from "@tanstack/react-router";
import { ArrowLeftRight, Coins, Info, Repeat, ShoppingBag, Tag, Wallet, X } from "lucide-react";
import type { MyListing, SwapRecord } from "@/lib/dashboard-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { useModalDialog } from "@/lib/dialog-a11y";

type Props = {
  open: boolean;
  onClose: () => void;
  credits: number;
  swaps: SwapRecord[];
  listings: MyListing[];
};

/**
 * Swapt's credits system. Credits are the platform's no-cash currency:
 *  - you earn them by listing items (the value you set) and completing swaps,
 *  - they move between members as items change hands,
 *  - you spend them on pieces other members list.
 * The ledger below is computed from the member's real swap + listing data.
 */
export function CreditsModal({ open, onClose, credits, swaps, listings }: Props) {
  const dialogRef = useModalDialog(open, onClose);
  const { n, d, t } = useI18n();
  if (!open) return null;

  const portfolioValue = listings.filter((l) => l.status === "active").reduce((n, l) => n + l.value, 0);
  const completed = swaps
    .filter((s) => s.status === "completed")
    .map((s) => ({
      id: s.id,
      name: s.counterparty.name,
      value: (s.requestedListing?.value ?? 0) + (s.offeredListing?.value ?? 0),
      at: s.completedAt ?? s.createdAt,
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm animate-fade-in outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Swap credits"
    >
      <div className="relative max-h-[90vh] w-full max-w-md animate-scale-in overflow-y-auto rounded-3xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card/95 px-5 py-4 backdrop-blur">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand/10 text-brand">
            <Wallet className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-black leading-none tracking-tight">Swap credits</h2>
            <p className="mt-1 text-xs text-foreground/55">Swapt&apos;s no-cash currency</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-2 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Balance */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-violet-500 to-brand p-5 text-white shadow-lg shadow-violet-500/25">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_100%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
            <div className="relative">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-white/70">
                <Coins className="h-4 w-4" /> Your balance
              </p>
              <p className="mt-2 text-5xl font-black tracking-tight">{n(credits)}</p>
              <div className="mt-4 flex gap-2">
                <Link to="/browse" onClick={onClose} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-3 py-2.5 text-xs font-bold text-violet-700 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <ShoppingBag className="h-3.5 w-3.5" /> Spend on items
                </Link>
                <Link to="/sell" onClick={onClose} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2.5 text-xs font-bold text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-white/20">
                  <Tag className="h-3.5 w-3.5" /> List to earn
                </Link>
              </div>
            </div>
          </div>

          {/* How it works */}
          <div>
            <h3 className="text-sm font-black tracking-tight">How credits work</h3>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { icon: Tag, step: "1 · List", text: "Every listing gets a credits value." },
                { icon: ArrowLeftRight, step: "2 · Swap", text: "Credits move with the items." },
                { icon: ShoppingBag, step: "3 · Spend", text: "Use them on other members' pieces." },
              ].map(({ icon: Icon, step, text }) => (
                <div key={step} className="rounded-2xl border border-border bg-muted/30 p-3 text-center">
                  <span className="mx-auto grid h-9 w-9 place-items-center rounded-xl bg-brand/10 text-brand">
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-2 text-xs font-black uppercase tracking-wide">{step}</p>
                  <p className="mt-1 text-xs leading-snug text-foreground/60">{text}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-foreground/45">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Credits have no cash value and can&apos;t be withdrawn or transferred to other accounts.
            </p>
          </div>

          {/* Ledger */}
          <div>
            <h3 className="text-sm font-black tracking-tight">Your credits activity</h3>
            <ul className="mt-3 space-y-2.5">
              <li className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 px-3.5 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-lavender text-foreground/70">
                  <Tag className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">In your active listings</p>
                  <p className="text-xs text-foreground/50">Earn these when a swap completes</p>
                </div>
                <span className="text-sm font-black">+{n(portfolioValue)}</span>
              </li>

              {completed.length === 0 ? (
                <li className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-foreground/55">
                  No completed swaps yet — finish one and the credits exchanged will show up here.
                </li>
              ) : (
                completed.slice(0, 4).map((c) => (
                  <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-border px-3.5 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600">
                      <Repeat className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">Swap with {c.name}</p>
                      <p className="text-xs text-foreground/50">
                        {d(c.at, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span className={cn("text-sm font-black", c.value > 0 ? "text-emerald-600" : "text-foreground/50")}>
                      {c.value > 0 ? `+${n(c.value)}` : "0"} {t("common.credits")} exchanged
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}