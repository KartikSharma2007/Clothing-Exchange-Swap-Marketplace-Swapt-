import { Search, ShoppingBag, Menu, ChevronDown, MessageCircle, Moon, Sun, Clock } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useI18n } from "@/lib/i18n";
import { DEPARTMENT_MENUS, emptySearch, type NavSearch } from "@/lib/taxonomy";
import { useWishlist } from "@/lib/wishlist";
import { NotificationBell } from "@/components/site/NotificationBell";
import { AccountMenu } from "@/components/site/AccountMenu";
import { usePreferences } from "@/lib/preferences";

const saleSearch: NavSearch = { ...emptySearch, tag: "sale" };

export function Navbar({ showDepartments = true }: { showDepartments?: boolean } = {}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [showSuggest, setShowSuggest] = useState(false);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOpen(false);
    setShowSuggest(false);
    const q = term.trim();
    if (q && typeof window !== "undefined") {
      try {
        const recent = JSON.parse(localStorage.getItem("swapt.recent-searches") || "[]") as string[];
        const next = [q, ...recent.filter((x) => x !== q)].slice(0, 5);
        localStorage.setItem("swapt.recent-searches", JSON.stringify(next));
      } catch {}
    }
    void navigate({ to: "/browse", search: { ...emptySearch, q } });
  };

  useEffect(() => {
    if (!showSuggest) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", onDown as any);
    document.addEventListener("touchstart", onDown as any, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDown as any);
      document.removeEventListener("touchstart", onDown as any);
    };
  }, [showSuggest]);

  const SUGGESTIONS = ["vintage denim jacket", "cargo shorts", "silk halter", "hoodie", "backpack", "sneakers", "Zara", "Levi's", "H&M", "T-shirts", "Jackets & Coats", "Bags"];
  const recentSearches: string[] = (() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("swapt.recent-searches") || "[]"); } catch { return []; }
  })();
  const filteredSuggest = term.trim()
    ? SUGGESTIONS.filter((s) => s.toLowerCase().includes(term.trim().toLowerCase())).slice(0, 6)
    : [...recentSearches, "cargo", "hoodie", "backpack"].slice(0, 5);

  const { isAuthenticated } = useAuth();
  const { count: bagCount } = useWishlist();
  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-br-lg bg-brand px-4 py-2 text-sm font-bold text-white focus:not-sr-only focus:fixed focus:left-0 focus:top-0"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-50 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-[1400px] items-center gap-2 sm:gap-4 px-4 py-3 md:px-8">
        <button
          className="md:hidden -ml-2 grid h-11 w-11 place-items-center rounded-xl hover:bg-muted active:bg-muted"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
          aria-expanded={open}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link to="/" className="shrink-0 text-xl sm:text-2xl font-black tracking-tight text-brand">
          swapt
        </Link>

        <Link to="/browse" className="hidden text-sm font-semibold text-foreground/70 hover:text-foreground md:inline">
          Browse
        </Link>
        <Link to="/about" className="hidden text-sm font-semibold text-foreground/70 hover:text-foreground md:inline">
          About
        </Link>

        <div ref={searchWrapRef} className="relative hidden flex-1 max-w-xl md:block">
          <form onSubmit={submitSearch} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              onFocus={() => setShowSuggest(true)}
              placeholder='Search for "vintage denim jacket"'
              aria-label="Search listings"
              className="w-full rounded-full border border-border bg-muted/60 py-2 pl-10 pr-4 text-sm outline-none transition-colors focus:border-foreground focus:bg-background"
            />
          </form>
          {showSuggest && filteredSuggest.length > 0 && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-border bg-card p-2 shadow-xl">
              <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-foreground/40">{term.trim() ? "Suggestions" : "Recent & trending"}</p>
              {filteredSuggest.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setTerm(s);
                    setShowSuggest(false);
                    void navigate({ to: "/browse", search: { ...emptySearch, q: s } });
                    if (typeof window !== "undefined") {
                      try {
                        const recent = JSON.parse(localStorage.getItem("swapt.recent-searches") || "[]") as string[];
                        const next = [s, ...recent.filter((x) => x !== s)].slice(0, 5);
                        localStorage.setItem("swapt.recent-searches", JSON.stringify(next));
                      } catch {}
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  {term.trim() ? <Search className="h-3.5 w-3.5 text-foreground/40" /> : <Clock className="h-3.5 w-3.5 text-foreground/40" />}
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right cluster — compact on phones, roomy from sm up. */}
        <div className="ml-auto flex flex-nowrap items-center gap-0.5 sm:gap-2 md:gap-3">
          {/* PC: Bag as pill button with icon inside */}
          <Link
            to="/bag"
            aria-label={bagCount ? `Bag, ${bagCount} saved items` : "Bag"}
            className="hidden md:inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-semibold text-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:shadow-sm active:scale-[0.98]"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={2} />
            <span>Bag</span>
            {bagCount > 0 && (
              <span className="ml-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-xs font-bold leading-none text-white">
                {bagCount > 99 ? "99+" : bagCount}
              </span>
            )}
          </Link>
          {/* Mobile: keep compact icon circle */}
          <Link
            to="/bag"
            aria-label={bagCount ? `Bag, ${bagCount} saved items` : "Bag"}
            className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground active:bg-muted md:hidden"
          >
            <ShoppingBag className="h-5 w-5" />
            {bagCount > 0 && (
              <span className="absolute right-0 top-0 grid h-5 min-w-5 animate-scale-in place-items-center rounded-full bg-brand px-1 text-xs font-bold leading-none text-background ring-2 ring-background">
                {bagCount > 99 ? "99+" : bagCount}
              </span>
            )}
          </Link>

          <DarkToggle />

          {isAuthenticated && <NotificationBell />}

          {isAuthenticated && (
            <Link
              to="/messages"
              aria-label="Messages"
              className="relative hidden h-11 w-11 shrink-0 place-items-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground active:bg-muted sm:grid"
            >
              <MessageCircle className="h-5 w-5" />
            </Link>
          )}

          <Link
            to="/sell"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-foreground px-3.5 text-xs font-bold text-background shadow-sm transition-all hover:-translate-y-0.5 hover:bg-foreground/90 active:translate-y-0 sm:ml-1 sm:px-5 sm:text-sm sm:font-semibold"
          >
            {t("nav.sellNow")}
          </Link>

          {isAuthenticated ? (
            <AccountMenu />
          ) : (
            <>
              <Link to="/login" className="hidden md:inline-flex min-h-11 items-center px-3 text-sm font-semibold text-foreground/80 transition-colors hover:text-foreground">
                {t("nav.logIn")}
              </Link>
              <Link to="/signup" className="hidden md:inline-flex min-h-11 items-center rounded-full border border-foreground px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-foreground hover:text-background">
                {t("nav.signUp")}
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Mobile search — always visible, premium feel */}
      <div className="md:hidden px-4 pb-3">
        <form onSubmit={submitSearch} className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onFocus={() => setShowSuggest(true)}
            placeholder='Search "vintage denim jacket"'
            aria-label="Search listings"
            className="w-full rounded-full border border-border bg-muted/60 py-3 pl-11 pr-4 text-[16px] outline-none transition-all focus:border-foreground focus:bg-background focus:ring-2 focus:ring-foreground/10 sm:text-sm min-h-11"
          />
        </form>
        {showSuggest && filteredSuggest.length > 0 && (
          <div className="mt-2 rounded-2xl border border-border bg-card p-2 shadow-xl">
            <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-foreground/40">{term.trim() ? "Suggestions" : "Recent & trending"}</p>
            {filteredSuggest.slice(0,4).map((s) => (
              <button
                key={s}
                onClick={() => {
                  setTerm(s);
                  setShowSuggest(false);
                  void navigate({ to: "/browse", search: { ...emptySearch, q: s } });
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-3 text-left text-sm hover:bg-muted min-h-11"
              >
                {term.trim() ? <Search className="h-3.5 w-3.5 text-foreground/40" /> : <Clock className="h-3.5 w-3.5 text-foreground/40" />}
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Desktop department bar with per-department mega menu */}
      {showDepartments && (
      <nav
        className="hidden border-t border-border md:block"
        onMouseLeave={() => setMenu(null)}
      >
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-8 py-3 text-sm font-medium">
          {DEPARTMENT_MENUS.map((d) => (
            <div key={d.label} onMouseEnter={() => setMenu(d.label)} onClick={() => setMenu(menu === d.label ? null : d.label)}>
              <Link
                to="/browse"
                search={d.search}
                onClick={() => setMenu(null)}
                className={`inline-flex items-center gap-1 py-2 px-1 min-h-11 transition-colors hover:text-brand active:text-brand ${
                  menu === d.label ? "text-brand" : ""
                }`}
              >
                {d.label}
                <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform ${menu === d.label ? "rotate-180" : ""}`} />
              </Link>
            </div>
          ))}
          <Link to="/browse" search={saleSearch} className="text-brand font-semibold">Sale</Link>
        </div>

        {DEPARTMENT_MENUS.filter((d) => d.label === menu).map((d) => (
          <div key={d.label} className="absolute inset-x-0 border-t border-border bg-background shadow-xl">
            <div className="mx-auto grid max-w-[1400px] gap-8 px-8 py-8 lg:grid-cols-[repeat(4,minmax(0,1fr))_260px]">
              {d.columns.map((col) => (
                <div key={col.title}>
                  <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-foreground/50">
                    {col.title}
                  </h3>
                  <ul className="space-y-1.5">
                    {col.items.map((item) => (
                      <li key={item.label}>
                        <Link
                          to="/browse"
                          search={{ ...emptySearch, ...item.search }}
                          onClick={() => setMenu(null)}
                          className="text-sm text-foreground/75 transition-colors hover:text-brand"
                        >
                          {item.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {d.highlight && (
                <Link
                  to="/browse"
                  search={{ ...emptySearch, ...d.highlight.search }}
                  onClick={() => setMenu(null)}
                  className="rounded-xl bg-surface-lavender p-5 transition-transform hover:-translate-y-0.5"
                >
                  <p className="text-base font-black tracking-tight">{d.highlight.title}</p>
                  <p className="mt-1 text-sm text-foreground/70">{d.highlight.blurb}</p>
                  <span className="mt-3 inline-block text-sm font-bold underline">Shop now</span>
                </Link>
              )}
            </div>
          </div>
        ))}
      </nav>
      )}

      {open && (
        <div className="md:hidden border-t border-border bg-background max-h-[70dvh] overflow-y-auto overscroll-contain">
          <ul className="divide-y divide-border px-4 py-2 text-sm font-medium">
            {DEPARTMENT_MENUS.map((d) => (
              <li key={d.label} className="py-1">
                <div className="flex items-center justify-between gap-2">
                  <Link to="/browse" search={d.search} onClick={() => setOpen(false)} className="min-h-11 flex items-center py-2.5 font-semibold">
                    {d.label}
                  </Link>
                  <button
                    aria-label={`Toggle ${d.label} categories`}
                    onClick={() => setMobileSection((s) => (s === d.label ? null : d.label))}
                    className="grid h-11 w-11 place-items-center rounded-xl hover:bg-muted active:bg-muted"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${mobileSection === d.label ? "rotate-180" : ""}`}
                    />
                  </button>
                </div>
                {mobileSection === d.label && (
                  <div className="pb-3 pl-1">
                    {d.columns.map((col) => (
                      <div key={col.title} className="mb-4">
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground/50">
                          {col.title}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {col.items.map((item) => (
                            <Link
                              key={item.label}
                              to="/browse"
                              search={{ ...emptySearch, ...item.search }}
                              onClick={() => setOpen(false)}
                              className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-colors hover:border-foreground/20 hover:bg-muted active:bg-muted"
                            >
                              {item.label}
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}
            <li className="flex items-center gap-3 py-3">
              <Link to="/browse" search={saleSearch} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 py-2 text-sm font-bold text-white">
                Sale
              </Link>
              <Link to="/about" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                About us
              </Link>
              {isAuthenticated && (
                <Link to="/messages" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">
                  <MessageCircle className="h-4 w-4" /> Messages
                </Link>
              )}
            </li>
            <li className="flex flex-wrap gap-2.5 py-4">
              <Link to="/sell" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full bg-foreground px-5 py-3 text-sm font-bold text-background">
                Sell now
              </Link>
              <Link to="/bag" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-muted">
                Bag{bagCount > 0 ? ` (${bagCount})` : ""}
              </Link>
              {isAuthenticated ? (
                <Link to="/dashboard" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-muted">
                  Account
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-muted">
                    Log in
                  </Link>
                  <Link to="/signup" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-foreground bg-foreground px-5 py-3 text-sm font-bold text-background">
                    Sign up
                  </Link>
                </>
              )}
            </li>
          </ul>
        </div>
      )}
      </header>
    </>
  );
}

function DarkToggle() {
  const { mode, set } = usePreferences();
  return (
    <button
      onClick={() => set("mode", mode === "dark" ? "light" : "dark")}
      aria-label={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="hidden md:grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground shadow-sm transition-all duration-200 hover:bg-muted hover:shadow hover:scale-[1.02] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="grid h-full w-full place-items-center">
        {mode === "dark" ? <Sun className="h-[18px] w-[18px]" strokeWidth={2} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={2} />}
      </span>
    </button>
  );
}