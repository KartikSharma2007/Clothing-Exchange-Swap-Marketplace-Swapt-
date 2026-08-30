import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpDown, Repeat2, Search, ShoppingBag, Trash2, X } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { useWishlist, type BagItem } from "@/lib/wishlist";
import { emptySearch } from "@/lib/taxonomy";
import { toast } from "sonner";

export const Route = createFileRoute("/bag")({
  head: () => ({
    meta: [
      { title: "My Bag — Saved items | Swapt" },
      { name: "description", content: "Everything you've saved on Swapt. Search, sort and filter your Bag, then move items straight into an exchange." },
      { property: "og:title", content: "My Bag — Saved items | Swapt" },
      { property: "og:description", content: "Everything you've saved on Swapt, ready to swap." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BagPage,
});

const PAGE_SIZE = 12;

type SortKey = "recent" | "oldest" | "value-asc" | "value-desc" | "title";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "recent", label: "Recently added" },
  { key: "oldest", label: "Oldest first" },
  { key: "value-asc", label: "Value: low to high" },
  { key: "value-desc", label: "Value: high to low" },
  { key: "title", label: "Title A–Z" },
];

function formatDate(iso: string) {
  let lang = "en-GB";
  try {
    const raw = window.localStorage.getItem("swapt.preferences");
    if (raw) lang = (JSON.parse(raw) as { language?: string }).language ?? lang;
  } catch { /* ignore */ }
  return new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" });
}

function BagPage() {
  const { items, loading, remove, clear } = useWishlist();
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [owner, setOwner] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [page, setPage] = useState(1);

  const categories = useMemo(
    () => [...new Set(items.map((i) => i.category).filter(Boolean))].sort(),
    [items],
  );
  const owners = useMemo(
    () => [...new Set(items.map((i) => i.owner).filter(Boolean))].sort(),
    [items],
  );

  const filtered = useMemo(() => {
    const q = term.trim().toLowerCase();
    const out = items.filter((i) => {
      if (q && !`${i.title} ${i.brand ?? ""} ${i.owner} ${i.category}`.toLowerCase().includes(q)) return false;
      if (category && i.category !== category) return false;
      if (owner && i.owner !== owner) return false;
      return true;
    });
    const sorted = [...out];
    switch (sort) {
      case "oldest": sorted.sort((a, b) => +new Date(a.addedAt) - +new Date(b.addedAt)); break;
      case "value-asc": sorted.sort((a, b) => a.value - b.value); break;
      case "value-desc": sorted.sort((a, b) => b.value - a.value); break;
      case "title": sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
      default: sorted.sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt));
    }
    return sorted;
  }, [items, term, category, owner, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const hasFilters = Boolean(term || category || owner);

  const resetFilters = () => {
    setTerm("");
    setCategory("");
    setOwner("");
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-12 sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[28px] font-black leading-none tracking-tight sm:text-3xl md:text-4xl">My Bag</h1>
            <p className="mt-1.5 text-sm text-foreground/60">
              {loading ? "Loading your saved items…" : `${items.length} saved ${items.length === 1 ? "item" : "items"}`}
            </p>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => { void clear(); toast.success("Bag emptied"); }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:border-destructive hover:text-destructive active:bg-muted sm:min-h-9 sm:px-4 sm:py-2"
            >
              <Trash2 className="h-4 w-4" /> Empty Bag
            </button>
          )}
        </header>

        {loading ? (
          <>
            {/* Mobile skeleton — compact rows */}
            <ul className="mt-5 space-y-2.5 sm:hidden" aria-busy="true">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
                  <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-muted" />
                  <div className="flex-1 space-y-2 py-1">
                    <div className="h-3.5 w-2/3 animate-pulse rounded-full bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded-full bg-muted" />
                    <div className="h-3 w-1/3 animate-pulse rounded-full bg-muted" />
                  </div>
                </li>
              ))}
            </ul>
            {/* Desktop skeleton — big cards */}
            <div className="mt-8 hidden gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-2xl border border-border">
                  <div className="aspect-square animate-pulse bg-muted" />
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : items.length === 0 ? (
          <EmptyBag />
        ) : (
          <>
            {/* ── Controls ── */}
            <div className="mt-5 space-y-2.5 rounded-2xl border border-border bg-card p-3 shadow-sm md:flex md:items-center md:gap-3 md:space-y-0">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={term}
                  onChange={(e) => { setTerm(e.target.value); setPage(1); }}
                  placeholder="Search your Bag"
                  aria-label="Search your Bag"
                  className="w-full rounded-full border border-border bg-muted/50 py-3 pl-10 pr-4 text-[16px] outline-none transition-colors focus:border-foreground focus:bg-background sm:py-2 sm:text-sm"
                />
              </div>

              {/* Selects: swipeable row on mobile · inline on desktop */}
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none md:contents">
                <select
                  value={category}
                  onChange={(e) => { setCategory(e.target.value); setPage(1); }}
                  className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-4 text-sm font-medium outline-none focus:border-foreground"
                  aria-label="Filter by category"
                >
                  <option value="">All categories</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>

                <select
                  value={owner}
                  onChange={(e) => { setOwner(e.target.value); setPage(1); }}
                  className="min-h-11 shrink-0 whitespace-nowrap rounded-full border border-border bg-background px-4 text-sm font-medium outline-none focus:border-foreground"
                  aria-label="Filter by seller"
                >
                  <option value="">All sellers</option>
                  {owners.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>

                <div className="relative shrink-0">
                  <ArrowUpDown className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={sort}
                    onChange={(e) => { setSort(e.target.value as SortKey); setPage(1); }}
                    className="min-h-11 whitespace-nowrap rounded-full border border-border bg-background py-0 pl-9 pr-4 text-sm font-medium outline-none focus:border-foreground"
                    aria-label="Sort"
                  >
                    {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>

                {hasFilters && (
                  <button
                    onClick={resetFilters}
                    className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-brand/10 px-4 text-sm font-semibold text-brand active:bg-brand/15"
                  >
                    <X className="h-3.5 w-3.5" /> Clear
                  </button>
                )}
              </div>
            </div>

            <p className="mt-3 text-xs font-medium text-foreground/50">
              Showing {visible.length} of {filtered.length} {filtered.length === 1 ? "item" : "items"}
            </p>

            {filtered.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-border py-14 text-center">
                <p className="text-base font-bold">No saved items match those filters</p>
                <button onClick={resetFilters} className="mt-2 text-sm font-semibold text-brand hover:underline">
                  Clear filters
                </button>
              </div>
            ) : (
              <>
                {/* ── MOBILE — compact saved rows ── */}
                <ul className="mt-3 space-y-2.5 sm:hidden">
                  {visible.map((item) => (
                    <CompactBagRow
                      key={item.listingId}
                      item={item}
                      onRemove={() => { void remove(item.listingId); toast.success(`Removed "${item.title}" from Bag`); }}
                    />
                  ))}
                </ul>

                {/* ── DESKTOP — original card grid, untouched ── */}
                <div className="mt-4 hidden gap-5 sm:grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {visible.map((item) => (
                    <BagCard
                      key={item.listingId}
                      item={item}
                      onRemove={() => { void remove(item.listingId); toast.success(`Removed "${item.title}" from Bag`); }}
                    />
                  ))}
                </div>
              </>
            )}

            {pageCount > 1 && (
              <nav className="mt-8 flex items-center justify-center gap-1.5 pb-2" aria-label="Pagination">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={current === 1}
                  className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40 sm:min-h-9 sm:px-3.5"
                >
                  Prev
                </button>
                {Array.from({ length: pageCount }).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i + 1)}
                    aria-current={current === i + 1 ? "page" : undefined}
                    className={`h-11 w-11 rounded-full text-sm font-semibold transition-colors sm:h-9 sm:w-9 ${
                      current === i + 1 ? "bg-foreground text-background" : "border border-border hover:bg-muted"
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={current === pageCount}
                  className="inline-flex min-h-11 items-center rounded-full border border-border px-4 text-sm font-semibold disabled:opacity-40 sm:min-h-9 sm:px-3.5"
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ══ MOBILE — compact row: small thumb + tight info + inline actions ══ */
function CompactBagRow({ item, onRemove }: { item: BagItem; onRemove: () => void }) {
  return (
    <li>
      <article className="rounded-2xl border border-border bg-card p-3 shadow-sm transition-shadow active:shadow-md max-md:rounded-2xl max-md:p-3 max-md:shadow-sm max-md:border-border">
        <div className="flex gap-3 max-md:gap-3">
          {/* Thumbnail — consistent size avoids jump at breakpoint */}
          <Link
            to="/listing/$id"
            params={{ id: item.listingId }}
            className="relative block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
          >
            {item.image ? (
              <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full place-items-center text-foreground/30"><ShoppingBag className="h-6 w-6" /></span>
            )}
            {item.category && (
              <span className="absolute bottom-1 left-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white backdrop-blur">
                {item.category.slice(0, 10)}
              </span>
            )}
          </Link>

          {/* Info — mobile larger text & breathing */}
          <div className="min-w-0 flex-1">
            <Link to="/listing/$id" params={{ id: item.listingId }} className="line-clamp-1 text-sm font-bold leading-snug hover:underline max-md:line-clamp-2 max-md:text-[14px] max-md:leading-snug">
              {item.title}
            </Link>
            <p className="mt-0.5 truncate text-xs text-foreground/55 max-md:text-[11px] max-md:whitespace-normal max-md:line-clamp-1">
              {item.owner}{item.size ? ` · Size ${item.size}` : ""}
            </p>
            <p className="mt-1 flex items-baseline gap-1 max-md:mt-1.5">
              <span className="text-[15px] font-black text-foreground max-md:text-base">{item.value}</span>
              <span className="text-[11px] font-semibold text-foreground/50">swap credits</span>
            </p>
            <p className="mt-0.5 text-[11px] font-medium text-foreground/40 max-md:mt-1">Added {formatDate(item.addedAt)}</p>
          </div>

          {/* Remove — mobile larger tap, centered when title wraps */}
          <button
            onClick={onRemove}
            aria-label={`Remove ${item.title} from Bag`}
            className="grid h-9 w-9 shrink-0 place-items-center self-start rounded-full text-foreground/35 transition-colors hover:bg-rose-50 hover:text-destructive active:bg-rose-100 max-md:h-11 max-md:w-11 max-md:bg-muted/60 max-md:text-foreground/50 max-md:self-center"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* Action — mobile thumb-friendly */}
        <Link
          to="/listing/$id"
          params={{ id: item.listingId }}
          className="mt-2.5 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-foreground/10 bg-muted/60 text-xs font-bold text-foreground transition-colors hover:bg-foreground hover:text-background active:bg-foreground max-md:min-h-12 max-md:rounded-2xl max-md:text-sm max-md:mt-3 max-md:font-black max-md:shadow-sm"
        >
          <Repeat2 className="h-3.5 w-3.5" /> Move to exchange
        </Link>
      </article>
    </li>
  );
}

/* ══ DESKTOP — original large card, unchanged ══ */
function BagCard({ item, onRemove }: { item: BagItem; onRemove: () => void }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg">
      <Link to="/listing/$id" params={{ id: item.listingId }} className="relative block aspect-square overflow-hidden bg-muted">
        {item.image ? (
          <img src={item.image} alt={item.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <span className="grid h-full place-items-center text-foreground/30"><ShoppingBag className="h-8 w-8" /></span>
        )}
        {item.category && (
          <span className="absolute left-2 top-2 rounded-full bg-background/90 px-2.5 py-0.5 text-[11px] font-bold">
            {item.category}
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link to="/listing/$id" params={{ id: item.listingId }} className="line-clamp-1 text-sm font-bold hover:underline">
          {item.title}
        </Link>
        <p className="mt-0.5 text-xs text-foreground/60">
          {item.owner}{item.size ? ` · Size ${item.size}` : ""}
        </p>
        <p className="mt-2 text-base font-black">{item.value} <span className="text-xs font-semibold text-foreground/55">swap credits</span></p>
        <p className="mt-1 text-xs font-medium text-foreground/45">Added {formatDate(item.addedAt)}</p>

        <div className="mt-4 flex gap-2">
          <Link
            to="/listing/$id"
            params={{ id: item.listingId }}
            className="flex-1 rounded-full bg-foreground px-3 py-2 text-center text-xs font-bold text-background transition-colors hover:bg-foreground/85"
          >
            <Repeat2 className="mr-1 inline h-3.5 w-3.5" /> Move to exchange
          </Link>
          <button
            onClick={onRemove}
            aria-label={`Remove ${item.title} from Bag`}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border transition-colors hover:border-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

function EmptyBag() {
  return (
    <div className="mt-8 flex flex-col items-center rounded-3xl border border-dashed border-border px-6 py-14 text-center md:mt-10 md:py-20">
      <svg viewBox="0 0 120 120" className="h-28 w-28 md:h-32 md:w-32" role="img" aria-label="Empty bag illustration">
        <circle cx="60" cy="60" r="52" className="fill-surface-lavender" />
        <path d="M38 46h44l-5 44a6 6 0 0 1-6 5H49a6 6 0 0 1-6-5z" className="fill-background stroke-foreground" strokeWidth="3" strokeLinejoin="round" />
        <path d="M50 46v-6a10 10 0 0 1 20 0v6" className="fill-none stroke-foreground" strokeWidth="3" strokeLinecap="round" />
        <path d="M52 66c3 4 5.5 6 8 6s5-2 8-6" className="fill-none stroke-brand" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <h2 className="mt-5 text-lg font-black tracking-tight md:text-xl">Your Bag is empty</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm text-foreground/60">
        Tap the heart on any listing to save it here. Your Bag follows you across devices once you're signed in.
      </p>
      <Link
        to="/browse"
        search={emptySearch}
        className="mt-5 inline-flex min-h-11 items-center rounded-full bg-foreground px-6 py-3 text-sm font-bold text-background transition-colors hover:bg-foreground/85"
      >
        Start browsing
      </Link>
    </div>
  );
}
