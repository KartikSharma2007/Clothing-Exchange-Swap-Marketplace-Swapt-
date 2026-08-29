import { Leaf, Droplets, Wind, Recycle, TrendingUp } from "lucide-react";
import { calcImpact, formatImpact } from "@/lib/impact";
import { Link } from "@tanstack/react-router";

export function ImpactCard({ swaps, listings = 0, compact = false, showCTA = true }: { swaps: number; listings?: number; compact?: boolean; showCTA?: boolean }) {
  const impact = calcImpact(swaps, listings);
  const fmt = formatImpact(impact);

  if (compact) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-emerald-500 text-white"><Leaf className="h-4 w-4" /></span>
          <div>
            <p className="text-sm font-black leading-none">{fmt.waste} saved</p>
            <p className="text-xs text-foreground/60">{impact.swaps} swaps · {fmt.water} water</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
      <div className="p-5">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 backdrop-blur"><Recycle className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-white/70">Your impact</p>
            <p className="text-lg font-black leading-none">You’ve saved {fmt.waste} of textile waste</p>
          </div>
        </div>
        <p className="mt-2 text-sm text-white/80">By swapping instead of buying new — {impact.swaps} swaps · {listings} listings given second life.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white/10 backdrop-blur p-3 text-center border border-white/10">
            <Leaf className="mx-auto h-5 w-5 text-white/80" />
            <p className="mt-1 text-lg font-black">{fmt.waste}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">Waste saved</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-3 text-center border border-white/10">
            <Droplets className="mx-auto h-5 w-5 text-white/80" />
            <p className="mt-1 text-lg font-black">{fmt.water}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">Water saved</p>
          </div>
          <div className="rounded-2xl bg-white/10 backdrop-blur p-3 text-center border border-white/10">
            <Wind className="mx-auto h-5 w-5 text-white/80" />
            <p className="mt-1 text-lg font-black">{fmt.co2}</p>
            <p className="text-xs font-bold uppercase tracking-wider text-white/60">CO₂ avoided</p>
          </div>
        </div>
        {showCTA && (
          <Link to="/about" className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-emerald-700 hover:bg-white/90">
            <TrendingUp className="h-3.5 w-3.5" /> How we calculate ↗
          </Link>
        )}
      </div>
      <div className="bg-white/10 backdrop-blur px-5 py-3 flex items-center justify-between text-xs">
        <span className="text-white/70">Share your impact</span>
        <span className="font-mono font-bold text-white">{impact.swaps} swaps · {impact.waterL.toLocaleString()} L</span>
      </div>
    </div>
  );
}
