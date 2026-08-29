import { Link } from "@tanstack/react-router";

// Every link points at a real route — the previous placeholder `<a href="#">`
// columns ("About us", "Careers", "Blog"…) and the literal "QR" box were dead
// UI that did nothing and misrepresented the app.
const cols = [
  {
    title: "Swapt",
    links: [
      { label: "About us", to: "/about" },
      { label: "Browse swaps", to: "/browse" },
      { label: "List an item", to: "/sell" },
      { label: "My dashboard", to: "/dashboard" },
    ],
  },
  {
    title: "My stuff",
    links: [
      { label: "Wishlist", to: "/bag" },
      { label: "Saved searches", to: "/saved-searches" },
      { label: "Settings", to: "/settings" },
    ],
  },
  {
    title: "Help",
    links: [
      { label: "FAQ", to: "/faq" },
      { label: "Contact us", to: "/contact" },
      { label: "Terms of Service", to: "/terms" },
      { label: "Privacy Policy", to: "/privacy" },
    ],
  },
];

const joinCol = {
  title: "Join Swapt",
  links: [
    { label: "Create an account", to: "/signup" },
    { label: "Log in", to: "/login" },
    { label: "Notifications", to: "/notifications" },
  ],
};

export function Footer() {
  return (
    <footer className="border-t border-border bg-muted/60 pb-[max(0px,env(safe-area-inset-bottom))] md:pb-0">
      {/* ══ MOBILE — brand + always-visible link groups (no toggles) — premium mobile */}
      <div className="px-5 pt-10 pb-6 md:hidden">
        {/* Brand */}
        <p className="text-[26px] font-black leading-none tracking-tight text-brand">
          swapt<span className="text-foreground">.</span>
        </p>
        <p className="mt-2.5 max-w-xs text-sm leading-relaxed text-foreground/60">
          Swap clothes, not landfills — find a better home for what you no longer wear.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Link
            to="/sell"
            className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 text-sm font-bold text-background shadow-sm transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            List an item
          </Link>
          <Link
            to="/signup"
            className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-5 text-sm font-semibold transition-colors hover:border-foreground/30 active:bg-muted"
          >
            Join Swapt
          </Link>
        </div>

        {/* Link groups — all visible, 2-col grid — mobile breathing */}
        <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-8">
          {[...cols, joinCol].map((c) => (
            <nav key={c.title} aria-label={c.title}>
              <h4 className="text-xs font-black uppercase tracking-[0.14em] text-foreground/45">{c.title}</h4>
              <ul className="mt-2 space-y-0.5">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      to={l.to}
                      className="-mx-2 flex min-h-10 items-center rounded-lg px-2 text-[15px] font-medium text-foreground/70 transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        {/* Bottom links — wrapped pills — mobile spacious */}
        <div className="mt-10 flex flex-wrap justify-center gap-x-1.5 gap-y-1.5 border-t border-border pt-6 pb-4">
          {[
            { label: "FAQ", to: "/faq" },
            { label: "Terms", to: "/terms" },
            { label: "Privacy", to: "/privacy" },
            { label: "Contact", to: "/contact" },
          ].map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="inline-flex min-h-10 items-center rounded-full px-3.5 text-xs font-semibold text-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:bg-muted"
            >
              {l.label}
            </Link>
          ))}
        </div>
        <p className="pb-3 text-center text-xs text-foreground/40">United States · © Swapt</p>
      </div>

      {/* ══ DESKTOP — original layout, untouched ══ */}
      <div className="hidden md:block">
        <div className="mx-auto grid max-w-[1400px] grid-cols-4 gap-8 px-8 py-12">
          {cols.map((c) => (
            <div key={c.title}>
              <h4 className="mb-3 text-sm font-bold">{c.title}</h4>
              <ul className="space-y-1 text-sm text-foreground/70">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link to={l.to} className="inline-flex min-h-9 items-center py-1.5 hover:text-foreground">{l.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h4 className="mb-3 text-sm font-bold">Join Swapt</h4>
            <ul className="space-y-1 text-sm text-foreground/70">
              <li>
                <Link to="/about" className="inline-flex min-h-9 items-center py-1.5 hover:text-foreground">About us</Link>
              </li>
              <li>
                <Link to="/signup" className="inline-flex min-h-9 items-center py-1.5 hover:text-foreground">Create an account</Link>
              </li>
              <li>
                <Link to="/login" className="inline-flex min-h-9 items-center py-1.5 hover:text-foreground">Log in</Link>
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-foreground/60">
              Swap clothes, not landfills — find a better home for what you no longer wear.
            </p>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto flex max-w-[1400px] flex-row items-center justify-between gap-3 px-8 py-4 text-xs text-foreground/60">
            <span className="inline-flex min-h-9 items-center">United States</span>
            <div className="flex flex-wrap gap-3">
              <Link to="/faq" className="inline-flex min-h-9 items-center rounded-full border border-transparent px-3 py-1.5 hover:border-border hover:bg-muted">FAQ</Link>
              <Link to="/notifications" className="inline-flex min-h-9 items-center rounded-full border border-transparent px-3 py-1.5 hover:border-border hover:bg-muted">Notifications</Link>
              <Link to="/terms" className="inline-flex min-h-9 items-center rounded-full border border-transparent px-3 py-1.5 hover:border-border hover:bg-muted">Terms</Link>
              <Link to="/privacy" className="inline-flex min-h-9 items-center rounded-full border border-transparent px-3 py-1.5 hover:border-border hover:bg-muted">Privacy</Link>
              <Link to="/contact" className="inline-flex min-h-9 items-center rounded-full border border-transparent px-3 py-1.5 hover:border-border hover:bg-muted">Contact</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
