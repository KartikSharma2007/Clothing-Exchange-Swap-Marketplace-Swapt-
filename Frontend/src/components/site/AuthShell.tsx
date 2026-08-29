import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Heart, Loader2, MapPin, ShieldCheck, Sparkles, Star, TrendingUp } from "lucide-react";
import hoodie from "@/assets/pop-hoodie.jpg";
import sneakers from "@/assets/pop-sneakers.jpg";
import shirt from "@/assets/style-shirt.jpg";
import backpack from "@/assets/pop-backpack.jpg";

/**
 * Split-screen auth layout: an editorial brand panel on the left (deep-ink
 * backdrop, a feed of real swapable pieces and live social proof), with the
 * form card on the right. Shared by /signup and /login.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  aside,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  aside?: { heading: string; points: string[] };
}) {
  const panel = aside ?? {
    heading: "Swap more. Buy less.",
    points: [
      "Thousands of preloved pieces added every week",
      "Trade item-for-item or top up with swap credits",
      "Verified members, tracked shipping, safe chat",
    ],
  };

  // The little "live swap feed" shown on the brand panel.
  const feed = [
    { img: hoodie, title: "Vintage rugby hoodie", meta: "M · 20 km", credits: 45, delay: "0s" },
    { img: sneakers, title: "Retro court sneakers", meta: "US 9 · 12 km", credits: 120, delay: "-1.6s" },
    { img: shirt, title: "Oversized oxford shirt", meta: "L · 8 km", credits: 30, delay: "-3.2s" },
  ];

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[1.08fr_1fr]">
      {/* ── Brand panel ───────────────────────────────────────────── */}
      <aside className="relative hidden overflow-hidden bg-surface-ink px-10 py-10 lg:flex lg:flex-col xl:px-14">
        {/* Warm signature-red glow + cool rim light */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_45%_at_18%_0%,rgba(224,53,58,0.30),transparent_60%),radial-gradient(50%_40%_at_90%_100%,rgba(224,53,58,0.16),transparent_60%),radial-gradient(30%_25%_at_70%_8%,rgba(255,255,255,0.10),transparent_55%)]" />
        {/* Fine grid texture */}
        <div className="pointer-events-none absolute inset-0 opacity-[0.16] [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:44px_44px]" />
        {/* Slow-spinning outline rings */}
        <div className="pointer-events-none absolute -bottom-24 -right-20 h-80 w-80 animate-[spin_36s_linear_infinite] rounded-full border-[14px] border-brand/10" />
        <div className="pointer-events-none absolute -top-20 -left-16 h-56 w-56 animate-[spin_44s_linear_infinite_reverse] rounded-full border-[10px] border-white/10" />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="text-3xl font-black tracking-tight text-white">
            swapt<span className="text-brand">.</span>
          </Link>
          <span className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm min-h-9 font-bold text-white/85 backdrop-blur">
            <BadgeCheck className="h-4 w-4 text-brand" /> Trusted marketplace
          </span>
        </div>

        {/* Middle */}
        <div className="relative z-10 flex flex-1 flex-col justify-center py-12">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-brand/30 bg-brand/15 px-3 py-2 text-sm min-h-9 font-bold text-brand">
            <Sparkles className="h-3.5 w-3.5" /> Join 30,000+ swappers
          </span>

          <h2 className="mt-5 max-w-md text-5xl font-black leading-[1.02] tracking-tight text-white xl:text-6xl">
            {panel.heading}
          </h2>

          {/* Live swap feed */}
          <div className="relative mt-12">
            <div className="grid grid-cols-3 gap-4">
              {feed.map((c) => (
                <div
                  key={c.title}
                  className="group animate-[float_7s_ease-in-out_infinite] overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.6)] backdrop-blur"
                  style={{ animationDelay: c.delay }}
                >
                  <div className="relative overflow-hidden">
                    <img src={c.img} alt={c.title} loading="lazy" className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    <span className="absolute right-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-foreground">
                      Swap
                    </span>
                    <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">
                      {c.credits} cr
                    </span>
                  </div>
                  <div className="px-2.5 py-2">
                    <p className="truncate text-xs font-bold text-white">{c.title}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-white/55">
                      <MapPin className="h-3 w-3" /> {c.meta}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Floating "It's a match!" toast */}
            <div className="absolute -right-3 bottom-24 animate-[float_9s_ease-in-out_infinite] rounded-2xl border border-white/15 bg-white/95 px-3.5 py-2.5 shadow-2xl [animation-delay:-2s]">
              <p className="flex items-center gap-2 text-xs font-black text-foreground">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-rose-100">
                  <Heart className="h-3.5 w-3.5 fill-rose-500 text-rose-500" />
                </span>
                It&apos;s a match!
              </p>
              <p className="mt-0.5 pl-8 text-xs font-medium text-foreground/55">You + Ayesha on the hoodie</p>
            </div>
          </div>

          {/* Points */}
          <ul className="mt-12 max-w-md space-y-3.5">
            {panel.points.map((p, i) => (
              <li
                key={p}
                className="flex items-start gap-3 text-sm text-white/70 opacity-0 animate-fade-in"
                style={{ animationDelay: `${150 * (i + 1)}ms`, animationFillMode: "forwards" }}
              >
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand/25">
                  <Check className="h-3 w-3 text-brand" />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        {/* Bottom stats + testimonial */}
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-8">
          <div className="grid grid-cols-3 gap-8">
            <div>
              <p className="flex items-center gap-1 text-2xl font-black leading-none text-white">
                30k+ <TrendingUp className="h-4 w-4 text-emerald-400" />
              </p>
              <p className="mt-1 text-xs text-white/50">Pieces swapped</p>
            </div>
            <div>
              <p className="flex items-center gap-1 text-2xl font-black leading-none text-white">
                4.9 <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              </p>
              <p className="mt-1 text-xs text-white/50">Member rating</p>
            </div>
            <div>
              <p className="text-2xl font-black leading-none text-white">120+</p>
              <p className="mt-1 text-xs text-white/50">Cities covered</p>
            </div>
          </div>

          <div className="max-w-[15rem]">
            <div className="flex items-center gap-2">
              <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-brand/60 to-brand/30 ring-2 ring-white/20">
                <img src={backpack} alt="Member" className="h-full w-full object-cover" />
              </div>
              <div>
                <p className="text-xs font-bold text-white">Maya, London</p>
                <p className="flex items-center gap-1 text-xs text-white/50">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" /> 14 successful swaps
                </p>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              “Swapped a coat I never wore for the exact pair of boots I kept eyeing. Zero guilt, zero landfill.”
            </p>
          </div>
        </div>
      </aside>

      {/* ── Form panel ───────────────────────────────────────────── */}
      <div className="relative flex min-h-dvh flex-col overflow-hidden">
        {/* soft glows behind the card */}
        <div className="pointer-events-none absolute left-1/2 top-16 h-80 w-80 -translate-x-1/2 rounded-full bg-brand/[0.07] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-64 w-64 translate-x-1/3 translate-y-1/3 rounded-full bg-surface-lavender/60 blur-3xl" />

        {/* Mobile brand hero — carries the story onto phones (hidden on lg+) */}
        <div className="relative z-10 overflow-hidden bg-surface-ink px-5 pb-14 pt-6 lg:hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_0%,rgba(224,53,58,0.28),transparent_65%),radial-gradient(40%_35%_at_100%_100%,rgba(224,53,58,0.14),transparent_60%)]" />
          <div className="relative mx-auto w-full max-w-md">
            <Link to="/" className="text-3xl font-black tracking-tight text-white">
              swapt<span className="text-brand">.</span>
            </Link>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/15 px-3 py-2 text-sm min-h-9 font-bold text-brand">
              <Sparkles className="h-3.5 w-3.5" /> Join 30,000+ swappers
            </span>
            <h2 className="mt-3 max-w-sm text-3xl font-black leading-tight tracking-tight text-white">
              {panel.heading}
            </h2>
            <div className="mt-5 flex items-center gap-6">
              <p className="text-xs font-bold text-white/60"><span className="block text-lg font-black leading-none text-white">30k+</span>swaps</p>
              <p className="text-xs font-bold text-white/60"><span className="block text-lg font-black leading-none text-white">4.9</span>rated</p>
              <p className="text-xs font-bold text-white/60"><span className="block text-lg font-black leading-none text-white">120+</span>cities</p>
            </div>
          </div>
        </div>

        {/* Card — mobile premium */}
        <div className="relative z-10 flex flex-1 flex-col justify-center px-4 py-8 sm:px-8 lg:py-10 max-md:px-4 max-md:py-6">
          <div className="mx-auto w-full max-w-md">
            <BackHome className="mb-7" />

            <div className="relative animate-scale-in overflow-hidden rounded-3xl border border-border bg-card/90 p-5 shadow-[0_28px_80px_-32px_rgb(0_0_0/0.5)] backdrop-blur-md md:p-9 max-md:rounded-[1.75rem] max-md:p-6 max-md:shadow-[0_16px_40px_-12px_rgb(0_0_0/0.25)]">
            {/* Top hairline accent */}
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-brand to-transparent" />

            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand/80 shadow-lg shadow-brand/25">
                <Sparkles className="h-5 w-5 text-brand-foreground" />
              </span>
              <div>
                <h1 className="text-2xl font-black leading-none tracking-tight md:text-[1.7rem]">{title}</h1>
                <p className="mt-1 text-sm text-foreground/60">{subtitle}</p>
              </div>
            </div>

            <div className="mt-7">{children}</div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2 text-center text-sm text-foreground/70">
            {footer}
          </div>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-foreground/40">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Free to join · No card required · Cancel anytime
          </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pill "Back to home" button — light variant for the auth form panel,
 *  `dark` variant for the ink login canvas. */
export function BackHome({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      className={`group inline-flex items-center gap-2 rounded-full border py-2 pl-2.5 pr-4 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md max-md:gap-1.5 max-md:py-2.5 max-md:pl-2.5 max-md:pr-3.5 max-md:text-xs max-md:font-bold max-md:min-h-11 max-md:shadow-sm ${className} ${
        dark
          ? "border-white/20 bg-white/10 text-white/85 hover:bg-white/20 hover:text-white max-md:border-white/15 max-md:bg-white/10 max-md:backdrop-blur"
          : "border-border bg-background/80 text-foreground/80 hover:bg-muted hover:text-foreground hover:shadow-lg"
      }`}
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-full transition-colors duration-200 group-hover:bg-brand group-hover:text-brand-foreground max-md:h-7 max-md:w-7 ${
          dark ? "bg-white/15 text-white" : "bg-muted"
        }`}
      >
        <ArrowLeft className="h-3.5 w-3.5 max-md:h-4 max-md:w-4" />
      </span>
      <span className="max-md:hidden">Back to home</span>
      <span className="hidden max-md:inline">Home</span>
    </Link>
  );
}

export function GoogleButton({
  label,
  onClick,
  loading = false,
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="group relative flex w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl border border-border bg-white px-4 py-3.5 text-sm font-bold shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 hover:border-foreground/15 active:translate-y-0 disabled:opacity-60 max-md:min-h-[52px] max-md:rounded-2xl max-md:py-3.5 max-md:text-[15px] max-md:font-black max-md:shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 hidden md:block" />
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-black/5 max-md:h-9 max-md:w-9">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4 max-md:h-5 max-md:w-5" />}
      </span>
      <span className="relative">{label}</span>
      <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-brand/0 via-brand/5 to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100 hidden md:block" />
    </button>
  );
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="my-5 flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-foreground/45">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      <span className="rounded-full border border-border bg-muted/50 px-2.5 py-0.5">{children}</span>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
  );
}

export function GoogleIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.28-1.93-6.14-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.86 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.68-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.68 2.84C6.72 7.31 9.14 5.38 12 5.38z"/>
    </svg>
  );
}

/** Shared field wrapper used by both auth forms. */
export function Field({
  label, error, children, trailing, hint,
}: { label: string; error?: string; children: ReactNode; trailing?: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold max-md:text-[13px]">{label}</span>
        {trailing}
      </div>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-foreground/50 max-md:text-[13px] max-md:leading-relaxed">{hint}</p>}
      {error && <p className="mt-1 animate-fade-in text-xs text-destructive max-md:text-[13px] max-md:leading-relaxed break-words">{error}</p>}
    </label>
  );
}

export function inputCls(hasError?: boolean) {
  return `w-full rounded-xl border bg-background px-3.5 py-2.5 text-sm outline-none transition-all duration-200 focus:ring-2 focus:ring-brand/25 max-md:rounded-2xl max-md:px-4 max-md:py-3.5 max-md:text-[16px] max-md:shadow-sm ${
    hasError ? "border-destructive focus:border-destructive" : "border-border focus:border-brand"
  }`;
}

export function SubmitButton({
  children, loading, className = "",
}: { children: ReactNode; loading?: boolean; className?: string }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className={`group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand/85 py-3 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/30 active:translate-y-0 disabled:opacity-60 ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
      {!loading && <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />}
    </button>
  );
}
