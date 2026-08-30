import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useMutation, useInfiniteQuery, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { z } from "zod";
import { BookmarkPlus, Coins, Loader2, MapPin, PackageX, Ruler, Scale, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SaveButton } from "@/components/site/SaveButton";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import CompareDialog from "@/components/site/CompareDialog";
import { categories, sizes, sortOptions } from "@/lib/mock-listings";
import { fetchFacets, fetchListings, type ApiListing } from "@/lib/listings-api";
import { addToCompare, clearCompare, readCompare, removeFromCompare } from "@/lib/compare";
import { apiEnabled } from "@/lib/api";
import { createSavedSearch } from "@/lib/saved-searches-api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const searchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  cat: fallback(z.string(), "").default(""),
  size: fallback(z.string(), "").default(""),
  condition: fallback(z.string(), "").default(""),
  g: fallback(z.string(), "").default(""),
  brand: fallback(z.string(), "").default(""),
  tag: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "newest").default("newest"),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radiusKm: fallback(z.number(), 50).optional(),
  // "false" must parse to false — z.coerce.boolean() treats "false" as truthy,
  // which made an un-toggled meetup-only filter come back after a reload.
  meetupOnly: fallback(
    z.preprocess((v) => {
      if (v === "false" || v === "0" || v === "") return false;
      if (v === "true" || v === "1") return true;
      return v;
    }, z.coerce.boolean()),
    false,
  ).default(false),
  minValue: z.coerce.number().min(0).optional().catch(undefined),
  maxValue: z.coerce.number().min(0).optional().catch(undefined),
});

type BrowseSearch = z.infer<typeof searchSchema>;

const genders = ["Womens", "Mens", "Kids", "Unisex"] as const;

const tagLabels: Record<string, string> = {
  sports: "Sports",
  trending: "Trending",
  sale: "Sale",
};

/** Human title for the current department / collection view. */
function headingFor(s: BrowseSearch) {
  if (s.brand) return s.brand;
  if (s.tag) return tagLabels[s.tag] ?? "Browse swaps";
  if (s.g) return s.g === "Kids" ? "Kids" : `${s.g} swaps`;
  return "Browse swaps";
}

/** Results per page — the backend caps this at 60. */
const PAGE_SIZE = 24;

export const Route = createFileRoute("/browse")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Browse swaps — Swapt" },
      { name: "description", content: "Search preloved clothing by category, size, and value. Filter and sort your way to the perfect swap." },
      { property: "og:title", content: "Browse swaps — Swapt" },
      { property: "og:description", content: "Search preloved clothing by category, size, and value." },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const search = Route.useSearch();
  const { q, cat, size, condition, sort, g, brand, tag, lat, lng, radiusKm, meetupOnly, minValue, maxValue } = search;
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState("");
  const [lastSaved, setLastSaved] = useState("");
  const [compareItems, setCompareItems] = useState<ApiListing[]>(() => readCompare());
  const [compareOpen, setCompareOpen] = useState(false);
  const [vMin, setVMin] = useState(minValue != null ? String(minValue) : "");
  const [vMax, setVMax] = useState(maxValue != null ? String(maxValue) : "");
  const [showFilters, setShowFilters] = useState(false);

  // Typing in a keyword defaults to relevance ranking; otherwise newest first.
  const effectiveSort = q && sort === "newest" ? "relevance" : sort;
  // Keep URL in sync so the sort select shows "Relevance" when a keyword is typed (was silently fetching relevance while UI showed Newest)
  useEffect(() => {
    if (q && sort === "newest") {
      // Use replace to avoid polluting history on every keystroke
      navigate({ search: (p: BrowseSearch) => ({ ...p, sort: "relevance" as any }), replace: true });
    }
  }, [q, sort, navigate]);

  const setSearch = (patch: Partial<BrowseSearch>) =>
    navigate({ search: (p: BrowseSearch) => ({ ...p, ...patch }) });

  const toggleCompare = (l: ApiListing) => {
    if (compareItems.some((x) => x.id === l.id)) {
      setCompareItems(removeFromCompare(l.id));
    } else {
      if (compareItems.length >= 4) {
        toast.error("Compare max 4 items — remove one first");
        return;
      }
      setCompareItems(addToCompare(l));
    }
  };

  const removeCompare = (id: string) => setCompareItems(removeFromCompare(id));

  // Keep the value-range inputs in sync when filters are cleared externally.
  useEffect(() => {
    setVMin(minValue != null ? String(minValue) : "");
    setVMax(maxValue != null ? String(maxValue) : "");
  }, [minValue, maxValue]);

  const applyValueRange = () => {
    const min = vMin !== "" ? Number(vMin) : undefined;
    const max = vMax !== "" ? Number(vMax) : undefined;
    if (min != null && isNaN(min)) { toast.error("Enter a valid min value"); return; }
    if (max != null && isNaN(max)) { toast.error("Enter a valid max value"); return; }
    if (min != null && max != null && min > max) { toast.error("Min cannot be greater than max"); return; }
    if (min != null && (min < 0 || min > 100000)) { toast.error("Min must be 0–100000"); return; }
    if (max != null && (max < 0 || max > 100000)) { toast.error("Max must be 0–100000"); return; }
    setSearch({ minValue: min, maxValue: max });
  };

  // Remember the last-applied filters so the Saved searches "New search" box
  // can capture them instead of creating a blank catch-all search.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        "swapt.last-search",
        JSON.stringify({ q, cat, size, condition, g, brand, tag, lat: lat ?? null, lng: lng ?? null, radiusKm: radiusKm ?? null, meetupOnly }),
      );
    } catch {
      /* storage unavailable — skip */
    }
  }, [q, cat, size, condition, g, brand, tag, lat, lng, radiusKm, meetupOnly]);

  // Real facet counts (brands/categories/sizes) from the catalog — not the mocks.
  const facets = useQuery({ queryKey: ["facets"], queryFn: fetchFacets });
  const browseBrands = (facets.data?.brands ?? []).map((b) => b.value);
  const browseCategories = (facets.data?.categories ?? []).map((c) => c.value);
  const browseSizes = (facets.data?.sizes ?? []).map((s) => s.value);
  // Use live facets when available, fallback to taxonomy so filters never appear empty in demo
  const displayCategories = browseCategories.length ? browseCategories : categories;
  const displaySizes = browseSizes.length ? browseSizes : sizes;

  // Debounced keyword search — avoid an API round-trip per keystroke.
  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => {
    if (searchInput !== q) {
      const t = window.setTimeout(() => setSearch({ q: searchInput }), 350);
      return () => window.clearTimeout(t);
    }
  }, [searchInput, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setSearchInput(q), [q]);

  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
  } = useInfiniteQuery({
    queryKey: ["listings", { q, cat, size, condition, sort: effectiveSort, g, brand, tag, lat, lng, radiusKm, meetupOnly, minValue, maxValue }],
    queryFn: ({ pageParam }) =>
      fetchListings({ q, cat, size, condition, sort: effectiveSort, g, brand, tag, lat, lng, radiusKm, meetupOnly, minValue, maxValue, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.pages > allPages.length ? allPages.length + 1 : undefined),
    placeholderData: keepPreviousData,
  });

  const saveSearch = useMutation({
    mutationFn: () =>
      createSavedSearch({ q, cat, size, condition, g, brand, tag, lat, lng, radiusKm, meetupOnly, alertsEnabled: true }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["me", "saved-searches"] });
      setLastSaved(JSON.stringify({ q, cat, size, condition, g, brand, tag, lat, lng, radiusKm, meetupOnly }));
    },
  });

  const justSaved = lastSaved === JSON.stringify({ q, cat, size, condition, g, brand, tag, lat, lng, radiusKm, meetupOnly });

  // "Near me": grab the browser's location and apply it to the browse query.
  const nearMe = () => {
    if (!navigator.geolocation) { setGeoError("Location isn't supported in this browser."); return; }
    setGeoBusy(true);
    setGeoError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoBusy(false);
        // Turn the location on AND switch to distance ranking — showing people
        // "newest first" after they ask to see what's near them is confusing.
        setSearch({ lat: pos.coords.latitude, lng: pos.coords.longitude, sort: "nearest" });
      },
      () => { setGeoBusy(false); setGeoError("Couldn't get your location — allow it and try again."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const filtered = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.total ?? filtered.length;

  // A value range is ONE filter whether it's min, max, or both — counting them
  // separately made the badge say "3 filters" when only 2 were applied.
  const activeCount = [
    cat, size, condition, q, g, brand, tag,
    meetupOnly ? "meetup" : "",
    lat != null && lng != null ? "near" : "",
    minValue != null || maxValue != null ? "value" : "",
  ].filter(Boolean).length;

  const clearAll = () =>
    navigate({ search: { q: "", cat: "", size: "", condition: "", g: "", brand: "", tag: "", sort: "newest", lat: undefined, lng: undefined, radiusKm: 50, meetupOnly: false, minValue: undefined, maxValue: undefined } });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className={cn("mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-10", compareItems.length > 0 && "pb-28")}>
        <div className="mb-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-brand">
                <span className="h-4 w-1 rounded-full bg-brand" /> Marketplace
              </p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight md:text-4xl">{headingFor(search)}</h1>
            </div>
            <p className="flex items-center gap-2 rounded-full bg-card px-3.5 py-1.5 text-sm font-semibold text-foreground/70 ring-1 ring-border">
              {isPending ? "Loading listings…" : `${total} item${total === 1 ? "" : "s"}`}
              {isFetching && !isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {!apiEnabled && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">demo</span>}
            </p>
          </div>

          {/* Location + save actions — mobile tighter, no double inset waste */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm sm:px-4 max-md:rounded-2xl max-md:px-3 max-md:py-3 max-md:gap-2.5 max-md:shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
            <button
              onClick={nearMe}
              disabled={geoBusy}
              className={cn(
                "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-bold transition-colors",
                lat !== undefined
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-border bg-background text-foreground/70 hover:border-foreground/40",
              )}
            >
              {geoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {lat !== undefined ? "Near me on" : "Near me"}
            </button>

            {lat !== undefined && (
              <>
                <select
                  value={radiusKm ?? 50}
                  onChange={(e) => setSearch({ radiusKm: Number(e.target.value) })}
                  className="rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold outline-none min-h-11"
                  aria-label="Radius"
                >
                  {[10, 25, 50, 100, 250].map((r) => (
                    <option key={r} value={r}>within {r} km</option>
                  ))}
                </select>
                <button onClick={() => setSearch({ lat: undefined, lng: undefined, sort: sort === "nearest" ? "newest" : sort })} className="inline-flex min-h-11 items-center text-sm font-semibold text-foreground/50 underline hover:text-foreground px-2">
                  clear
                </button>
              </>
            )}

            <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground/70 cursor-pointer hover:border-foreground/20">
              <input
                type="checkbox"
                checked={meetupOnly}
                onChange={(e) => setSearch({ meetupOnly: e.target.checked })}
                className="h-4 w-4 rounded accent-foreground"
              />
              Local meetup only
            </label>

            {geoError && <span className="text-sm text-rose-600 w-full sm:w-auto">{geoError}</span>}

            {isAuthenticated && (
              <button
                onClick={() => saveSearch.mutate()}
                disabled={saveSearch.isPending}
                className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-4 py-2.5 text-sm font-bold text-background shadow-sm transition-opacity hover:bg-foreground/90 disabled:opacity-50"
                title="Alert me when new items match this search"
              >
                {saveSearch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookmarkPlus className="h-4 w-4" />}
                {saveSearch.isPending ? "Saving…" : justSaved ? "Saved!" : "Save this search"}
              </button>
            )}
          </div>
        </div>

        {/* Search bar — 44px+ on mobile, no iOS zoom */}
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title, brand, color..."
            className="w-full rounded-full border border-border bg-card py-3.5 pl-11 pr-4 text-[16px] shadow-sm outline-none transition-all placeholder:text-sm focus:border-brand/60 focus:ring-4 focus:ring-brand/10 sm:py-3 sm:text-sm min-h-11"
          />
        </div>

        {/* Mobile filter trigger — replaces wall */}
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <button
            onClick={() => setShowFilters(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-foreground bg-foreground px-4 py-3 text-sm font-bold text-background shadow-sm"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters {activeCount > 0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs text-white">{activeCount}</span>}
          </button>
          <label className="flex items-center gap-2 text-sm font-medium min-h-11">
            <span className="text-foreground/60 text-xs">Sort</span>
            <select
              value={effectiveSort}
              onChange={(e) => setSearch({ sort: e.target.value })}
              className="rounded-full border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none min-h-11"
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {lat !== undefined && <option value="nearest">Nearest</option>}
              {effectiveSort === "relevance" && !sortOptions.some((o) => o.value === "relevance") && <option value="relevance">Relevance</option>}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_1fr]">
          {/* Filters — drawer on mobile, sidebar on desktop */}
          <aside className="hidden md:block md:sticky md:top-32 md:self-start">
            <div className="space-y-5 rounded-2xl border border-border bg-card p-4 shadow-sm md:p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-black">
                  <SlidersHorizontal className="h-4 w-4 text-brand" /> Filters
                </div>
                {activeCount > 0 && (
                  <button onClick={clearAll} className="inline-flex min-h-11 items-center text-xs font-bold text-brand hover:underline px-2">
                    Clear all
                  </button>
                )}
              </div>

            <FilterGroup title="Department">
              <div className="flex flex-wrap gap-2">
                {genders.map((x) => (
                  <Chip key={x} active={g === x} onClick={() => setSearch({ g: g === x ? "" : x })}>
                    {x}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Collection">
              <div className="flex flex-wrap gap-2">
                {Object.entries(tagLabels).map(([value, label]) => (
                  <Chip key={value} active={tag === value} onClick={() => setSearch({ tag: tag === value ? "" : value })}>
                    {label}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Value (credits)">
              <form
                onSubmit={(e) => { e.preventDefault(); applyValueRange(); }}
                className="space-y-2"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    placeholder="Min"
                    value={vMin}
                    onChange={(e) => setVMin(e.target.value)}
                    aria-label="Minimum value"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-brand/50"
                  />
                  <span className="text-xs text-foreground/50">–</span>
                  <input
                    type="number"
                    min={0}
                    placeholder="Max"
                    value={vMax}
                    onChange={(e) => setVMax(e.target.value)}
                    aria-label="Maximum value"
                    className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none transition-colors focus:border-brand/50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-foreground py-2.5 text-sm min-h-11 font-bold text-background transition-opacity hover:opacity-85"
                  >
                    Apply
                  </button>
                  {(minValue != null || maxValue != null) && (
                    <button
                      type="button"
                      onClick={() => {
                        setVMin(""); setVMax("");
                        setSearch({ minValue: undefined, maxValue: undefined });
                      }}
                      className="text-xs font-semibold text-foreground/50 underline hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>
            </FilterGroup>

            <FilterGroup title="Brand">
              <div className="flex flex-wrap gap-2">
                {browseBrands.map((b) => (
                  <Chip key={b} active={brand === b} onClick={() => setSearch({ brand: brand === b ? "" : b })}>
                    {b}
                  </Chip>
                ))}
              </div>
            </FilterGroup>

            <FilterGroup title="Category">
              <div className="flex flex-wrap gap-2">
                {displayCategories.map((c) => {
                  const count = facets.data?.categories.find((x) => x.value === c)?.count;
                  return (
                    <Chip
                      key={c}
                      active={cat === c}
                      onClick={() => setSearch({ cat: cat === c ? "" : c })}
                    >
                      {c} {count ? `(${count})` : ""}
                    </Chip>
                  );
                })}
              </div>
            </FilterGroup>

            <FilterGroup title="Size">
              <div className="flex flex-wrap gap-2">
                {displaySizes.map((s) => {
                  const count = facets.data?.sizes.find((x) => x.value === s)?.count;
                  return (
                    <Chip
                      key={s}
                      active={size === s}
                      onClick={() => setSearch({ size: size === s ? "" : s })}
                    >
                      {s} {count ? `(${count})` : ""}
                    </Chip>
                  );
                })}
              </div>
            </FilterGroup>

            <FilterGroup title="Condition">
              <div className="flex flex-wrap gap-2">
                {["New with tags", "New", "Like new", "Good", "Fair"].map((c) => (
                  <Chip
                    key={c}
                    active={condition === c}
                    onClick={() => setSearch({ condition: condition === c ? "" : c })}
                  >
                    {c}
                  </Chip>
                ))}
              </div>
            </FilterGroup>
            </div>
          </aside>

          {/* Mobile filter drawer — bottom sheet, drag handle, 44px chips */}
          {showFilters && (
            <div className="fixed inset-0 z-50 md:hidden">
              <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={() => setShowFilters(false)} />
              <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-hidden rounded-t-[1.75rem] border border-border bg-background shadow-2xl flex flex-col">
                <div className="flex justify-center pt-3">
                  <span className="h-1.5 w-10 rounded-full bg-foreground/15" aria-hidden />
                </div>
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                  <h2 className="flex items-center gap-2 text-base font-black"><SlidersHorizontal className="h-4 w-4 text-brand" /> Filters {activeCount>0 && <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{activeCount}</span>}</h2>
                  <button onClick={() => setShowFilters(false)} className="grid h-11 w-11 place-items-center rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
                </div>
                <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-6">
                  <FilterGroup title="Department">
                    <div className="flex flex-wrap gap-2.5">
                      {genders.map((x) => <Chip key={x} active={g === x} onClick={() => setSearch({ g: g === x ? "" : x })}>{x}</Chip>)}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Collection">
                    <div className="flex flex-wrap gap-2.5">
                      {Object.entries(tagLabels).map(([value, label]) => <Chip key={value} active={tag === value} onClick={() => setSearch({ tag: tag === value ? "" : value })}>{label}</Chip>)}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Value (credits)">
                    <form onSubmit={(e) => { e.preventDefault(); applyValueRange(); }} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <input type="number" min={0} placeholder="Min" value={vMin} onChange={(e) => setVMin(e.target.value)} aria-label="Minimum value" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-[16px] outline-none focus:border-brand/50 sm:text-sm min-h-11" />
                        <span className="text-sm text-foreground/50">–</span>
                        <input type="number" min={0} placeholder="Max" value={vMax} onChange={(e) => setVMax(e.target.value)} aria-label="Maximum value" className="w-full rounded-xl border border-border bg-background px-3 py-3 text-[16px] outline-none focus:border-brand/50 sm:text-sm min-h-11" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="submit" className="flex-1 rounded-xl bg-foreground py-3 text-sm font-bold text-background min-h-11">Apply</button>
                        {(minValue != null || maxValue != null) && <button type="button" onClick={() => { setVMin(""); setVMax(""); setSearch({ minValue: undefined, maxValue: undefined }); }} className="px-3 py-2 text-sm font-semibold underline min-h-11">Clear</button>}
                      </div>
                    </form>
                  </FilterGroup>
                  <FilterGroup title="Brand">
                    <div className="flex flex-wrap gap-2.5">
                      {browseBrands.slice(0,12).map((b) => <Chip key={b} active={brand === b} onClick={() => setSearch({ brand: brand === b ? "" : b })}>{b}</Chip>)}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Category">
                    <div className="flex flex-wrap gap-2.5">
                      {displayCategories.slice(0,12).map((c) => <Chip key={c} active={cat === c} onClick={() => setSearch({ cat: cat === c ? "" : c })}>{c}</Chip>)}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Size">
                    <div className="flex flex-wrap gap-2.5">
                      {displaySizes.map((s) => <Chip key={s} active={size === s} onClick={() => setSearch({ size: size === s ? "" : s })}>{s}</Chip>)}
                    </div>
                  </FilterGroup>
                  <FilterGroup title="Condition">
                    <div className="flex flex-wrap gap-2.5">
                      {["New with tags","New","Like new","Good","Fair"].map((c) => <Chip key={c} active={condition === c} onClick={() => setSearch({ condition: condition === c ? "" : c })}>{c}</Chip>)}
                    </div>
                  </FilterGroup>
                </div>
                <div className="border-t border-border bg-card p-4 pt-3 flex gap-3 pb-[max(12px,env(safe-area-inset-bottom))]">
                  <button onClick={() => { clearAll(); setShowFilters(false); }} className="flex-1 rounded-full border border-border py-3 text-sm font-bold min-h-11">Clear all</button>
                  <button onClick={() => setShowFilters(false)} className="flex-[1.5] rounded-full bg-foreground py-3 text-sm font-bold text-background min-h-11">{total} {total===1?"item":"items"} · Show</button>
                </div>
              </div>
            </div>
          )}

          {/* Grid + sort */}
          <div>
            {/* Active chips — mobile: horizontal scroll, thin fade hint — last chip stays visible */}
            {(cat || size || condition || g || brand || tag || meetupOnly || lat !== undefined) && (
              <div className="relative mb-3 flex flex-wrap gap-2.5 md:hidden max-md:flex-nowrap max-md:overflow-x-auto max-md:scrollbar-none max-md:snap-x max-md:-mx-4 max-md:px-4 max-md:pb-1 max-md:gap-2 max-md:scroll-ps-4 max-md:scroll-pe-6 after:hidden max-md:after:block after:absolute after:right-0 after:top-0 after:bottom-1 after:w-6 after:bg-gradient-to-l after:from-background after:to-transparent after:pointer-events-none">
                {cat && <ActiveChip label={cat} onRemove={() => setSearch({ cat: "" })} />}
                {size && <ActiveChip label={`Size ${size}`} onRemove={() => setSearch({ size: "" })} />}
                {condition && <ActiveChip label={condition} onRemove={() => setSearch({ condition: "" })} />}
                {g && <ActiveChip label={g} onRemove={() => setSearch({ g: "" })} />}
                {brand && <ActiveChip label={brand} onRemove={() => setSearch({ brand: "" })} />}
                {tag && <ActiveChip label={tagLabels[tag] ?? tag} onRemove={() => setSearch({ tag: "" })} />}
                {meetupOnly && <ActiveChip label="Local meetup" onRemove={() => setSearch({ meetupOnly: false })} />}
                {lat !== undefined && <ActiveChip label="Near me" onRemove={() => setSearch({ lat: undefined, lng: undefined })} />}
              </div>
            )}
            <div className="mb-4 hidden md:flex items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {cat && <ActiveChip label={cat} onRemove={() => setSearch({ cat: "" })} />}
                {size && <ActiveChip label={`Size ${size}`} onRemove={() => setSearch({ size: "" })} />}
                {condition && <ActiveChip label={condition} onRemove={() => setSearch({ condition: "" })} />}
                {g && <ActiveChip label={g} onRemove={() => setSearch({ g: "" })} />}
                {brand && <ActiveChip label={brand} onRemove={() => setSearch({ brand: "" })} />}
                {tag && <ActiveChip label={tagLabels[tag] ?? tag} onRemove={() => setSearch({ tag: "" })} />}
                {meetupOnly && <ActiveChip label="Local meetup" onRemove={() => setSearch({ meetupOnly: false })} />}
                {lat !== undefined && <ActiveChip label="Near me" onRemove={() => setSearch({ lat: undefined, lng: undefined })} />}
              </div>
              <label className="hidden md:flex items-center gap-2 text-sm">
                <span className="text-foreground/60">Sort</span>
                <select
                  value={effectiveSort}
                  onChange={(e) => setSearch({ sort: e.target.value })}
                  className="rounded-full border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground min-h-11"
                >
                  {sortOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  {lat !== undefined && <option value="nearest">Nearest</option>}
                  {effectiveSort === "relevance" && !sortOptions.some((o) => o.value === "relevance") && <option value="relevance">Relevance</option>}
                </select>
              </label>
            </div>

            {error ? (
              <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-12 text-center">
                <p className="text-sm text-destructive">
                  Couldn&apos;t load listings. Is the API running at {import.meta.env.VITE_API_URL}?
                </p>
              </div>
            ) : isPending ? (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i}>
                    <div className="aspect-square animate-pulse rounded-2xl bg-muted" />
                    <div className="mt-2.5 h-3 w-2/3 animate-pulse rounded-full bg-muted" />
                    <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center">
                <p className="text-sm text-foreground/60">No items match. Try clearing a filter.</p>
              </div>
            ) : (

              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
                {filtered.map((l) => (
                  <Link
                    key={l.id}
                    to="/listing/$id"
                    params={{ id: l.id }}
                    className="group block"
                  >
                    <div className="relative aspect-square overflow-hidden rounded-[1.25rem] bg-muted shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover:shadow-xl sm:rounded-2xl">
                      <img
                        src={l.images[0]} alt={l.title} loading="lazy"
                        className={`h-full w-full object-cover transition-transform duration-500 ease-out ${l.status === "swapped" || l.status === "hidden" ? "saturate-50" : "group-hover:scale-[1.05]"}`}
                      />
                      {(l.status === "swapped" || l.status === "hidden") && (
                        <div className="absolute inset-0 grid place-items-center bg-foreground/40 backdrop-blur-[1px]">
                          <span className="flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-2.5 text-sm min-h-11 font-black uppercase tracking-widest text-foreground shadow">
                            <PackageX className="h-3.5 w-3.5 text-rose-500" /> Swapped
                          </span>
                        </div>
                      )}
                      <SaveButton
                        className="absolute right-2 top-2 h-9 w-9 opacity-100 max-md:right-1.5 max-md:top-1.5 max-md:h-8 max-md:w-8 md:opacity-0 transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100"
                        item={{
                          listingId: l.id,
                          title: l.title,
                          image: l.images[0],
                          owner: l.seller?.name ?? "Swapt member",
                          value: l.value,
                          category: l.category,
                          brand: l.brand,
                          size: l.size,
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleCompare(l); }}
                        aria-label={compareItems.some((x) => x.id === l.id) ? `Remove ${l.title} from compare` : `Add ${l.title} to compare`}
                        title="Add to compare"
                        className={cn(
                          "absolute right-2 top-12 grid h-11 w-11 place-items-center rounded-full shadow ring-1 ring-black/5 transition-colors max-md:right-1.5 max-md:top-10 max-md:h-9 max-md:w-9",
                          compareItems.some((x) => x.id === l.id) ? "bg-brand text-brand-foreground" : "bg-background/90 text-foreground/70 hover:text-brand",
                        )}
                      >
                        <Scale className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
                      </button>
                      {l.likelyFit && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white backdrop-blur">
                          <Ruler className="h-3 w-3" /> Fits you
                        </span>
                      )}
                      {l.meetup && (
                        <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600/90 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white backdrop-blur">
                          Meetup
                        </span>
                      )}
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2.5 py-2.5 text-sm min-h-11 font-black text-foreground shadow-sm backdrop-blur">
                        <Coins className="h-3 w-3 text-brand" /> {l.value}
                      </span>
                    </div>
                    <div className="mt-2.5 px-0.5">
                      <p className="truncate text-sm font-bold transition-colors group-hover:text-brand">{l.title}</p>
                      <p className="mt-0.5 truncate text-xs text-foreground/60">{l.brand} · Size {l.size}</p>
                      {l.seller?.username && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-foreground/55">
                          <Star className="h-3 w-3 fill-current text-amber-400" />
                          {Number(l.seller.rating ?? 0).toFixed(1)}
                          <span className="truncate text-foreground/45">· {l.seller.name}</span>
                        </p>
                      )}
                      {l.distanceKm != null && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand">
                          <MapPin className="h-3 w-3" /> {l.distanceKm} km away
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {hasNextPage && (
              <div className="mt-8 flex justify-center">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md disabled:opacity-60"
                >
                  {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isFetchingNextPage ? "Loading more…" : "Load more items"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Compare tray */}
      {compareItems.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md pb-[max(10px,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-[1400px] items-center gap-3 max-md:gap-2">
            <div className="flex flex-1 items-center gap-2 overflow-x-auto max-md:gap-2.5 max-md:snap-x max-md:scroll-px-4 max-md:scrollbar-none max-md:pb-1">
              {compareItems.map((l) => (
                <div key={l.id} className="relative shrink-0">
                  <img src={l.images[0]} alt={l.title} className="h-12 w-12 rounded-xl border border-border object-cover" />
                  <button
                    onClick={() => toggleCompare(l)}
                    aria-label={`Remove ${l.title} from compare`}
                    className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-rose-500 text-white shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setCompareOpen(true)}
              disabled={compareItems.length < 2}
              className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-bold text-brand-foreground shadow-sm transition-all hover:-translate-y-0.5 disabled:opacity-50 min-h-11"
            >
              <Scale className="h-4 w-4" /> Compare ({compareItems.length})
            </button>
            <button
              onClick={() => { clearCompare(); setCompareItems([]); }}
              className="shrink-0 inline-flex min-h-11 items-center text-sm font-semibold text-foreground/50 underline hover:text-foreground px-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <CompareDialog
        open={compareOpen}
        items={compareItems}
        onClose={() => setCompareOpen(false)}
        onRemove={removeCompare}
      />
      <Footer />
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-foreground/60">{title}</h3>
      {children}
    </div>
  );
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
        active
          ? "border-brand bg-brand text-brand-foreground shadow-sm shadow-brand/20"
          : "border-border bg-background text-foreground/80 hover:border-brand/40 hover:text-foreground active:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-foreground px-3.5 py-2 text-sm font-semibold text-background">
      {label}
      <button onClick={onRemove} aria-label={`Remove ${label}`} className="grid h-7 w-7 place-items-center rounded-full bg-white/15 hover:bg-white/25 active:bg-white/30 ml-1">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
