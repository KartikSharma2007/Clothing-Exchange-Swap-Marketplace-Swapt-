import { useState } from "react";
import { Link } from "@tanstack/react-router";
import heroImg from "@/assets/hero-collage.jpg";
import { ShieldCheck, Package, Sparkles, Repeat, Camera, Tag, ArrowRight, BadgeCheck } from "lucide-react";
import { emptySearch } from "@/lib/taxonomy";

type Mode = "list" | "swap";

export function Hero() {
  const [mode, setMode] = useState<Mode>("list");
  const swap = mode === "swap";

  return (
    <section className={`relative overflow-hidden ${swap ? "bg-surface-cream" : "bg-surface-lavender"}`}>
      {/* Soft brand washes behind everything */}
      <div className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-brand/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 left-[-8%] h-80 w-80 rounded-full bg-brand/5 blur-3xl" />

      <div
        className={`relative mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-8 px-4 py-8 sm:gap-10 sm:py-12 md:grid-cols-2 md:px-8 md:py-16 lg:gap-14 ${
          swap ? "md:[&>*:first-child]:order-2" : ""
        }`}
      >
        <div>
          <div className="mb-5 inline-flex rounded-full border border-foreground/15 bg-background/80 p-1 text-sm font-semibold shadow-sm backdrop-blur sm:mb-6">
            <button
              type="button"
              aria-pressed={swap}
              onClick={() => setMode("swap")}
              className={`inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                swap ? "bg-foreground text-background shadow-sm" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              Swap
            </button>
            <button
              type="button"
              aria-pressed={!swap}
              onClick={() => setMode("list")}
              className={`inline-flex min-h-11 items-center rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${
                !swap ? "bg-foreground text-background shadow-sm" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              List
            </button>
          </div>

          {swap ? (
            <>
              <h1 className="text-[30px] font-black leading-[0.95] tracking-tight sm:text-4xl sm:leading-[1.04] md:text-[56px] md:leading-[1.03]">
                Swap preloved.
                <br />
                <span className="text-brand">Wear it your way.</span>
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-foreground/70">
                Trade the pieces in your closet for something new-to-you. No cash, just great taste.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5 sm:mt-7 sm:gap-3">
                <Link
                  to="/browse"
                  search={{ ...emptySearch, tag: "trending" }}
                  className="group inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand/85 px-6 py-3 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/40 sm:px-7 sm:py-3.5"
                >
                  <Repeat className="h-4 w-4 transition-transform duration-300 group-hover:rotate-90" /> Start swapping
                </Link>
                <Link
                  to="/browse"
                  search={emptySearch}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/20 bg-background/70 px-6 py-3 text-sm font-bold transition-colors hover:bg-foreground hover:text-background sm:px-7 sm:py-3.5"
                >
                  Browse all items <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <dl className="mt-6 grid max-w-md grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
                <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Swap safely" value="Protected" />
                <Stat icon={<Repeat className="h-4 w-4" />} label="Swaps done" value="1.2M+" />
                <Stat icon={<Sparkles className="h-4 w-4" />} label="New daily" value="500K+" />
              </dl>
            </>
          ) : (
            <>
              <h1 className="text-[30px] font-black leading-[0.95] tracking-tight sm:text-4xl sm:leading-[1.04] md:text-[56px] md:leading-[1.03]">
                List in minutes.
                <br />
                <span className="text-brand">Swap it your way.</span>
              </h1>
              <p className="mt-4 max-w-md text-base leading-relaxed text-foreground/70">
                Snap a few photos, set a swap value, and let the community come to you.
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5 sm:mt-7 sm:gap-3">
                <Link
                  to="/sell"
                  className="group inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand/85 px-6 py-3 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/40 sm:px-7 sm:py-3.5"
                >
                  <Camera className="h-4 w-4" /> List an item
                </Link>
                <Link
                  to="/dashboard"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-foreground/20 bg-background/70 px-6 py-3 text-sm font-bold transition-colors hover:bg-foreground hover:text-background sm:px-7 sm:py-3.5"
                >
                  My listings <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <dl className="mt-6 grid max-w-md grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
                <Stat icon={<Tag className="h-4 w-4" />} label="Listing fee" value="Free" />
                <Stat icon={<Package className="h-4 w-4" />} label="Items listed" value="49M+" />
                <Stat icon={<ShieldCheck className="h-4 w-4" />} label="Seller cover" value="Protected" />
              </dl>
            </>
          )}
        </div>

        {/* Hero image — premium, not clipped — finger friendly */}
        <div className="relative px-2 sm:px-0">
          <div className="overflow-hidden rounded-[1.75rem] shadow-2xl ring-1 ring-black/5 sm:rounded-[2rem] transition-transform duration-300 active:scale-[0.98] max-md:active:scale-[0.98]">
            <img
              src={heroImg}
              alt="Preloved fashion collage"
              width={1200}
              height={900}
              className={`w-full object-cover transition-all duration-500 ${
                swap ? "aspect-[3/2] sm:aspect-[4/5] md:aspect-[5/6]" : "aspect-[16/11] sm:aspect-[4/3] md:aspect-[5/4]"
              }`}
            />
          </div>

          {/* Floating chips — inside bounds on mobile */}
          <span className="absolute left-3 top-3 flex items-center gap-1.5 animate-[float_7s_ease-in-out_infinite] rounded-full bg-background/95 px-3 py-2 text-xs font-bold shadow-xl ring-1 ring-black/5 backdrop-blur sm:-left-3 sm:top-8 sm:px-3.5">
            <Repeat className="h-3.5 w-3.5 text-brand" />
            {swap ? "No cash · ever" : "Free to list"}
          </span>
          <span className="absolute bottom-3 right-3 flex items-center gap-1.5 animate-[float_9s_ease-in-out_infinite] rounded-2xl border border-border bg-background/95 px-3 py-2 text-xs font-bold shadow-xl backdrop-blur sm:-right-2 sm:bottom-8 sm:px-3.5 sm:py-2.5 [animation-delay:-2s]">
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" />
            {swap ? "500K+ items ready to swap" : "Average listing: 90 seconds"}
          </span>
        </div>
      </div>
    </section>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-foreground/10 bg-background/80 p-2.5 shadow-sm backdrop-blur transition-transform hover:-translate-y-0.5 sm:p-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground/60">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-sm font-black tracking-tight sm:text-[15px]">{value}</div>
    </div>
  );
}