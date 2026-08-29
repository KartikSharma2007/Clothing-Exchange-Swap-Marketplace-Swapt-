import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Award, Globe, Heart, Leaf, Package, Recycle, ShieldCheck, Sparkles, Star, TrendingUp, Users } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About Swapt — Our Story & Mission" },
      { name: "description", content: "Swapt is a community marketplace for swapping preloved clothing. Learn our mission, values and how we keep swaps safe." },
      { property: "og:title", content: "About Swapt" },
      { property: "og:description", content: "Swap clothes, not landfills — our story, mission and community." },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand/[0.08] via-surface-cream to-violet-500/[0.06]">
          <div className="pointer-events-none absolute -top-24 right-[-10%] h-96 w-96 rounded-full bg-brand/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-[-8%] h-80 w-80 rounded-full bg-violet-500/8 blur-3xl" />
          <div className="relative mx-auto max-w-[1400px] px-4 py-16 md:px-8 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3.5 py-2.5 text-sm min-h-11 font-bold uppercase tracking-widest text-brand">
                <Leaf className="h-3.5 w-3.5" /> Since 2021 · Community first
              </span>
              <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-tight md:text-6xl">
                Swap clothes, <span className="bg-gradient-to-r from-brand to-brand/70 bg-clip-text text-transparent">not landfills.</span>
              </h1>
              <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-foreground/70 md:text-lg">
                Swapt is the marketplace where your preloved pieces find a better home and you find something
                new-to-you — without spending a penny. No cash, just credits, community and great taste.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <Link to="/browse" className="inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background shadow-lg transition-all hover:-translate-y-0.5">
                  Browse swaps <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/signup" className="inline-flex items-center gap-2 rounded-full border border-foreground/20 bg-background px-6 py-3 text-sm font-bold transition-colors hover:bg-foreground hover:text-background">
                  Join the community
                </Link>
              </div>
            </div>

            {/* Stats */}
            <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { value: "49M+", label: "Items listed", icon: Package },
                { value: "1.2M+", label: "Swaps done", icon: Recycle },
                { value: "4.8", label: "Avg rating", icon: Star },
                { value: "500K+", label: "New daily", icon: TrendingUp },
              ].map(({ value, label, icon: Icon }) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                  <Icon className="mx-auto h-5 w-5 text-brand" />
                  <p className="mt-2 text-2xl font-black tracking-tight">{value}</p>
                  <p className="text-xs font-semibold text-foreground/60">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mission */}
        <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8 md:py-16">
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-brand">Our mission</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">Fashion without the footprint.</h2>
              <p className="mt-4 text-sm leading-relaxed text-foreground/70 md:text-base">
                The fashion industry produces 92 million tonnes of waste a year. We believe the most sustainable garment is the one
                that already exists. Swapt gives every piece a second (and third) life by making peer-to-peer swapping as easy as
                scrolling — with credits, escrow and verified reviews to keep it safe.
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                {[
                  "Credits keep it cash-free — swap value is community-priced in credits.",
                  "Escrow protects both sides until the swap is confirmed.",
                  "Fit intelligence flags 'likely your fit' across the catalog.",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600"><ShieldCheck className="h-3 w-3" /></span>
                    <span className="text-foreground/75">{t}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="rounded-[2rem] bg-gradient-to-br from-brand to-violet-600 p-[2px] shadow-xl shadow-brand/20">
                <div className="rounded-[1.9rem] bg-card p-6 md:p-8">
                  <h3 className="flex items-center gap-2 text-lg font-black tracking-tight"><Globe className="h-5 w-5 text-brand" /> Why swapping?</h3>
                  <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                    {[
                      { k: "10x", v: "less CO₂", sub: "vs buying new" },
                      { k: "72%", v: "keep longer", sub: "in circulation" },
                      { k: "0", v: "cash needed", sub: "just credits" },
                    ].map((s) => (
                      <div key={s.k} className="rounded-2xl bg-muted/50 p-3">
                        <p className="text-xl font-black text-brand">{s.k}</p>
                        <p className="text-xs font-bold">{s.v}</p>
                        <p className="text-xs text-foreground/50">{s.sub}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-foreground/60">
                    Source: Ellen MacArthur Foundation & Swapt community data. Swaps extend garment life by an average of 2.2 years.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Values */}
        <section className="bg-muted/40">
          <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8 md:py-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-black tracking-tight">What we stand for</h2>
              <p className="mt-3 text-sm text-foreground/60">Four values guide every product decision, moderation call and swap we facilitate.</p>
            </div>
            <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: Leaf, title: "Planet first", desc: "Extend garment life, reduce waste. Every swap is a win against fast fashion.", tone: "bg-emerald-500/10 text-emerald-600" },
                { icon: Users, title: "Community led", desc: "Ratings, reviews and reliability scores keep trust high — powered by you.", tone: "bg-brand/10 text-brand" },
                { icon: ShieldCheck, title: "Safe swaps", desc: "Credits sit in escrow until both sides confirm. Bad actors are removed fast.", tone: "bg-violet-500/10 text-violet-600" },
                { icon: Heart, title: "Style for all", desc: "Womens, Mens, Kids, Unisex — all sizes, all budgets, all welcome.", tone: "bg-amber-500/10 text-amber-600" },
              ].map(({ icon: Icon, title, desc, tone }) => (
                <div key={title} className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-3 text-base font-black tracking-tight">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-foreground/60">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8 md:py-16">
          <h2 className="text-center text-3xl font-black tracking-tight">How Swapt works</h2>
          <p className="mx-auto mt-2 max-w-xl text-center text-sm text-foreground/60">Three steps, under five minutes. Your closet does the rest.</p>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[
              { step: "01", title: "List in minutes", desc: "Snap 2–3 photos, set a credit value and add your size. AI can fill the rest.", icon: Package },
              { step: "02", title: "Match or browse", desc: "We surface 'likely your fit' items. Propose a swap — or accept one.", icon: Sparkles },
              { step: "03", title: "Ship or meet up", desc: "Escrow holds credits. Ship with tracking or meet locally, then confirm receipt.", icon: ShieldCheck },
            ].map(({ step, title, desc, icon: Icon }) => (
              <div key={step} className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="absolute right-4 top-4 text-4xl font-black tracking-tight text-foreground/5">{step}</span>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-foreground text-background"><Icon className="h-5 w-5" /></span>
                <h3 className="mt-4 text-base font-black">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground/60">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <Link to="/sell" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand/80 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand/25 transition-all hover:-translate-y-0.5">
              List your first item <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Sustainability impact — how we calculate */}
        <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
          <div className="rounded-[1.5rem] border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 md:p-8">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white"><Leaf className="h-5 w-5" /></span>
              <div>
                <h2 className="text-xl font-black tracking-tight">Sustainability impact you can count</h2>
                <p className="text-sm text-foreground/60">Every completed swap avoids producing a new garment. Here’s what we count — conservatively.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 text-center">
                <p className="text-3xl font-black text-emerald-600">1.8 kg</p>
                <p className="text-sm font-bold">Textile waste diverted</p>
                <p className="mt-1 text-xs text-foreground/60">per swap — avg 0.5 kg garment + avoided production waste (WRAP 2023)</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 text-center">
                <p className="text-3xl font-black text-emerald-600">2,700 L</p>
                <p className="text-sm font-bold">Water saved</p>
                <p className="mt-1 text-xs text-foreground/60">per swap — cotton tee baseline, extending life 9 months saves 20-30% footprint</p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-white p-4 text-center">
                <p className="text-3xl font-black text-emerald-600">6.5 kg</p>
                <p className="text-sm font-bold">CO₂ avoided</p>
                <p className="mt-1 text-xs text-foreground/60">per swap (Ellen MacArthur Foundation / WRAP)</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-sm text-white">
              <span className="font-bold">Your dashboard shows your personal impact:</span> “You’ve saved X kg / L / CO₂” from your completed swaps. It’s live — swap once and watch it tick up.
            </div>
            <p className="mt-3 text-xs text-foreground/50">Sources: Ellen MacArthur Foundation “Circular Fibres Initiative” (2017), WRAP “Textiles 2030”, UK waste &amp; water data. We use conservative mid-values; listed items that haven’t swapped count as 0.3 kg partial credit on the dashboard card.</p>
          </div>
        </section>

        {/* Trust & safety */}
        <section className="bg-surface-cream">
          <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8 md:py-16">
            <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr]">
              <div>
                <h2 className="text-2xl font-black tracking-tight md:text-3xl">Built for trust.</h2>
                <p className="mt-3 text-sm leading-relaxed text-foreground/70">
                  We manually review premium brands, verify sellers and hold credits in escrow until both parties confirm.
                  Disputes go to a human moderator — not a bot.
                </p>
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[
                    "Verified & phone badges",
                    "Escrow + tracking",
                    "Human moderation",
                    "Block / report instantly",
                  ].map((t) => (
                    <div key={t} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-3 text-sm font-semibold shadow-sm">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" /> {t}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-[1.5rem] border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-black"><Award className="h-4 w-4 text-amber-500" /> Member promise</div>
                <blockquote className="mt-3 rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-foreground/70">
                  “Swapt only works if you trust the person on the other side. We take that personally — every feature we ship has to make swaps safer, not just faster.”
                  <footer className="mt-3 text-xs font-bold text-foreground">— The Swapt Team</footer>
                </blockquote>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/contact" className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted">Contact us</Link>
                  <Link to="/terms" className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted">Terms</Link>
                  <Link to="/privacy" className="rounded-full border border-border bg-background px-4 py-2 text-xs font-bold hover:bg-muted">Privacy</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
          <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-r from-brand via-brand to-[#e04a50] p-8 text-white shadow-xl shadow-brand/25 md:p-10">
            <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full border-[14px] border-white/10" />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-2xl font-black tracking-tight">Ready to give your closet a second life?</h3>
                <p className="mt-1 text-sm text-white/80">Join 100k+ swappers — list your first piece in under 2 minutes.</p>
              </div>
              <div className="flex gap-3">
                <Link to="/signup" className="rounded-full bg-white px-6 py-3 text-sm font-bold text-brand shadow-lg transition-transform hover:scale-[1.02]">Create account</Link>
                <Link to="/browse" className="rounded-full border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold backdrop-blur transition-colors hover:bg-white/20">Browse swaps</Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
