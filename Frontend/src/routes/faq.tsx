import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, HelpCircle, MessageCircle, Shield, Sparkles, Package, CreditCard, Truck, Users } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — Swapt Help Center" },
      { name: "description", content: "Answers to common questions about swapping, credits, shipping, safety and your account." },
    ],
  }),
  component: FAQPage,
});

const FAQS: { q: string; a: string; icon: typeof HelpCircle; cat: string }[] = [
  { cat: "Getting started", q: "How does Swapt work?", a: "List an item with photos, set a credit value, and browse. When you find something you like, propose a swap. If they accept, credits are held in escrow until both confirm delivery (tracking or meetup), then released.", icon: Sparkles },
  { cat: "Getting started", q: "What are credits?", a: "Credits are the cash-free currency of Swapt. Every listing has a credit value (e.g., 25 cr). When a swap is accepted, the net difference is held in escrow. Top up in your Wallet if you need more.", icon: CreditCard },
  { cat: "Getting started", q: "How do I list my first item?", a: "Go to Sell → add 2–3 photos, fill title/brand/category/size/condition/color, set a swap value, and publish. AI can auto-fill from your first photo. Drafts auto-save.", icon: Package },
  { cat: "Swaps & shipping", q: "Do I ship or meet locally?", a: "Either. Choose shipping (add carrier + tracking after accept) or local meetup (set place + time, see embedded map). Shipping swaps require tracking before they can be marked completed; meetups require a place.", icon: Truck },
  { cat: "Swaps & shipping", q: "How long do pending swaps take to expire?", a: "7 days without a reply. Each counter-offer restarts the 7-day window. You’ll get email + push alerts before expiry.", icon: Users },
  { cat: "Swaps & shipping", q: "What if my item is damaged/lost?", a: "Open a dispute from the swap thread, upload evidence photos, and a moderator reviews escrow. Do not mark completed until delivery is verified.", icon: Shield },
  { cat: "Trust & safety", q: "How do you keep swaps safe?", a: "Phone verification badges, escrow holds, tracked returns, human moderation, and block/report/mute from any profile. Suspicious listings are hidden by admins.", icon: Shield },
  { cat: "Trust & safety", q: "Can I block or mute someone?", a: "Yes — open their profile → ••• → Block (hides them everywhere, unfollows both ways) or Mute (suppresses their notifications). Manage in Settings → Privacy.", icon: Users },
  { cat: "Account", q: "I deleted my account — can I recover it?", a: "Yes, within 30 days. Use Contact → Recover a deactivated account with the email you signed up with. We verify identity and restore access.", icon: HelpCircle },
  { cat: "Account", q: "How do I change email or delete data?", a: "Email is your sign-in; contact support to change it. Delete account in Settings → Delete account (soft-delete, retained 30 days for disputes). Export your listings CSV in Dashboard.", icon: MessageCircle },
];

const cats = [...new Set(FAQS.map((f) => f.cat))];

function Accordion({ q, a, icon: Icon, defaultOpen = false }: { q: string; a: string; icon: typeof HelpCircle; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-4 py-4 text-left">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand/10 text-brand shrink-0"><Icon className="h-4 w-4" /></span>
        <span className="flex-1 text-sm font-bold">{q}</span>
        <ChevronDown className={`h-4 w-4 text-foreground/40 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-border bg-muted/20 px-4 py-3 text-sm leading-relaxed text-foreground/70">{a}</div>}
    </div>
  );
}

function FAQPage() {
  const [activeCat, setActiveCat] = useState<string>("All");
  const [search, setSearch] = useState("");
  const filtered = FAQS.filter((f) => {
    if (activeCat !== "All" && f.cat !== activeCat) return false;
    if (search && !`${f.q} ${f.a} ${f.cat}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" className="mx-auto max-w-[1100px] px-4 py-8 md:px-8 md:py-12">
        <div className="rounded-3xl border border-border bg-card p-6 md:p-8 shadow-sm">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-3 py-2 text-sm min-h-9 font-bold text-brand"><HelpCircle className="h-3.5 w-3.5" /> Help Center</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">How can we help?</h1>
          <p className="mt-2 max-w-2xl text-sm text-foreground/60">Search FAQs, browse by category, or contact support. We reply within 24–48h.</p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <HelpCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search FAQs (e.g. credits, shipping, block)" className="w-full rounded-full border border-border bg-muted/40 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-foreground focus:bg-background" />
            </div>
            <Link to="/contact" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-bold text-background hover:bg-foreground/90"><MessageCircle className="h-4 w-4" /> Contact support</Link>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {["All", ...cats].map((c) => (
              <button key={c} onClick={() => setActiveCat(c)} className={`rounded-full px-3.5 py-2.5 text-sm min-h-11 font-bold border ${activeCat === c ? "bg-foreground text-background border-foreground" : "border-border bg-background hover:bg-muted"}`}>{c}</button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-3">
          {filtered.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-foreground/60">No FAQs match. Try a different search or <Link to="/contact" className="text-brand underline">contact us</Link>.</p> : filtered.map((f, i) => <Accordion key={f.q} q={f.q} a={f.a} icon={f.icon} defaultOpen={i === 0} />)}
        </div>

        <div className="mt-8 rounded-3xl bg-gradient-to-r from-brand to-brand/80 p-6 text-white shadow-lg">
          <h3 className="text-lg font-black">Still stuck?</h3>
          <p className="mt-1 text-sm text-white/80">Our team can recover deactivated accounts, review swaps, and fix bugs.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/contact" className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-brand">Contact us</Link>
            <Link to="/about" className="rounded-full border border-white/30 px-5 py-2.5 text-sm font-bold hover:bg-white/10">About Swapt</Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
