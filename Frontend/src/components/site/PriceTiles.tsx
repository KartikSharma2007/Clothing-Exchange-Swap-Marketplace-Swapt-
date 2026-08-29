import { Link } from "@tanstack/react-router";
import { Coins } from "lucide-react";
import { SectionHeader } from "./SectionHeader";

const tiers = [10, 20, 50, 100];

export function PriceTiles() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-14 md:px-8">
      <SectionHeader title="Swap by value" subtitle="Set your budget in credits and let the swap decide — great finds under every tier." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        {tiers.map((t) => (
          <Link
            key={t}
            to="/browse"
            search={{ q: "", cat: "", size: "", g: "", brand: "", tag: "", sort: "value-asc", maxValue: t }}
            aria-label={`Browse swaps under ${t} credits`}
            className="group relative flex overflow-hidden rounded-2xl bg-surface-lavender ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:bg-brand hover:text-brand-foreground hover:shadow-lg hover:shadow-brand/25 active:scale-[0.98] sm:aspect-[3/1] sm:items-center sm:justify-center sm:gap-2"
          >
            {/* ── MOBILE: centred vertical tile — value never truncates ── */}
            <span className="flex w-full flex-col items-center justify-center gap-1.5 px-2 py-4 sm:hidden">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-white/80 text-brand shadow-sm transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110">
                <Coins className="h-[18px] w-[18px]" />
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-60">Under</span>
              <span className="whitespace-nowrap text-xl font-black leading-none tracking-tight">{t}</span>
              <span className="text-xs font-semibold opacity-70">credits</span>
            </span>

            {/* ── DESKTOP: original centred banner ── */}
            <span className="pointer-events-none absolute inset-0 hidden bg-gradient-to-br from-white/30 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:block" />
            <Coins className="hidden h-5 w-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110 sm:block" />
            <span className="relative hidden text-lg font-black tracking-tight transition-transform duration-300 group-hover:scale-105 sm:inline">
              Under {t} credits
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
