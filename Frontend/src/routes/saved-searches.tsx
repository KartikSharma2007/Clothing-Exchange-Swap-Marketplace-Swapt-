import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2, Plus, Trash2, Search } from "lucide-react";
import { useState } from "react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import {
  fetchSavedSearches,
  createSavedSearch,
  updateSavedSearch,
  deleteSavedSearch,
  type SavedSearch,
  type SavedSearchInput,
} from "@/lib/saved-searches-api";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/saved-searches")({
  head: () => ({
    meta: [
      { title: "Saved searches — Swapt" },
      { name: "description", content: "Manage your saved searches and new-listing alerts." },
    ],
  }),
  component: () => (
    <Protected>
      <SavedSearchesPage />
    </Protected>
  ),
});

/** The filters last applied on the browse page, captured so a "New search"
 *  made here isn't a blank catch-all. Returns {} if nothing was browsed yet. */
function lastBrowseFilters(): SavedSearchInput {
  if (typeof window === "undefined") return {};
  try {
    const raw = JSON.parse(window.localStorage.getItem("swapt.last-search") ?? "null") as Record<string, unknown> | null;
    if (!raw) return {};
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const bool = (v: unknown) => (typeof v === "boolean" ? v : false);
    return {
      q: str(raw.q), cat: str(raw.cat), size: str(raw.size), g: str(raw.g),
      brand: str(raw.brand), tag: str(raw.tag),
      lat: num(raw.lat), lng: num(raw.lng), radiusKm: num(raw.radiusKm),
      meetupOnly: bool(raw.meetupOnly),
    };
  } catch {
    return {};
  }
}

function labelFor(s: SavedSearch) {
  const parts: string[] = [];
  if (s.brand) parts.push(s.brand);
  if (s.cat) parts.push(s.cat);
  if (s.g) parts.push(s.g);
  if (s.size) parts.push(`Size ${s.size}`);
  if (s.tag) parts.push(`#${s.tag}`);
  if (s.q) parts.push(`“${s.q}”`);
  if (s.lat != null && s.lng != null) parts.push(`Near me · ${s.radiusKm ?? 50} km`);
  if (s.meetupOnly) parts.push("Local meetup only");
  return parts.join(" · ") || "Everything";
}

export function SavedSearchesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");

  const { data, isLoading } = useQuery({ queryKey: ["me", "saved-searches"], queryFn: fetchSavedSearches });

  const create = useMutation({
    // Captures the filters last used on the browse page so the search isn't blank.
    mutationFn: () => createSavedSearch({ name, ...lastBrowseFilters() }),
    onSuccess: () => { setName(""); void qc.invalidateQueries({ queryKey: ["me", "saved-searches"] }); },
  });

  const toggle = useMutation({
    mutationFn: ({ id, alertsEnabled }: { id: string; alertsEnabled: boolean }) =>
      updateSavedSearch(id, { alertsEnabled }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "saved-searches"] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["me", "saved-searches"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-8 md:px-8 max-md:px-4 max-md:py-6">
        <h1 className="text-2xl font-black tracking-tight md:text-3xl max-md:text-[26px] max-md:leading-none">Saved searches</h1>
        <p className="mt-1 text-sm text-foreground/60 max-md:text-xs">
          {user?.displayName ?? "You"}, we'll ping you when a new item matches one of these.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
          className="mt-6 flex gap-2 max-md:gap-2.5"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this search (e.g. “Weekend outfits”)…"
            className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/50 max-md:rounded-2xl max-md:px-4 max-md:py-3.5 max-md:text-[16px] max-md:shadow-sm"
          />
          <button
            type="submit"
            disabled={create.isPending || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-bold text-background disabled:opacity-50 max-md:min-h-11 max-md:rounded-2xl max-md:px-4 max-md:py-3"
          >
            <Plus className="h-4 w-4" /> {create.isPending ? "Saving…" : "New search"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-foreground/50">
          New searches capture the filters you last used on the browse page — or use{" "}
          <span className="font-semibold text-foreground">Save this search</span> there to capture the current ones automatically.
        </p>

        <div className="mt-4 space-y-2">
          {isLoading ? (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-foreground/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </p>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground/50">
              No saved searches yet.
            </div>
          ) : (
            items.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-xl border border-border bg-background p-3 max-md:rounded-2xl max-md:p-4 max-md:gap-3 max-md:shadow-sm">
                <Link
                  to="/browse"
                  search={{ q: s.q, cat: s.cat, size: s.size, g: s.g, brand: s.brand, tag: s.tag, sort: "newest", lat: s.lat ?? undefined, lng: s.lng ?? undefined, radiusKm: s.radiusKm ?? undefined, meetupOnly: s.meetupOnly }}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground/70 hover:bg-muted/70 max-md:h-11 max-md:w-11 max-md:rounded-xl"
                  aria-label="Run this search"
                >
                  <Search className="h-4 w-4" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold max-md:text-[13px]">{s.name || labelFor(s)}</p>
                  <p className="truncate text-xs text-foreground/55 max-md:text-[11px]">{labelFor(s)}</p>
                </div>
                <button
                  onClick={() => toggle.mutate({ id: s.id, alertsEnabled: !s.alertsEnabled })}
                  disabled={toggle.isPending}
                  title={s.alertsEnabled ? "Alerts on" : "Alerts off"}
                  className={`grid h-8 w-8 place-items-center rounded-lg transition-colors max-md:h-11 max-md:w-11 max-md:rounded-xl ${
                    s.alertsEnabled ? "bg-amber-100 text-amber-700" : "bg-muted text-foreground/40"
                  }`}
                >
                  {s.alertsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => { if (window.confirm("Delete this saved search?")) remove.mutate(s.id); }}
                  disabled={remove.isPending}
                  className="grid h-8 w-8 place-items-center rounded-lg text-foreground/40 transition-colors hover:bg-rose-50 hover:text-rose-600 max-md:h-11 max-md:w-11 max-md:rounded-xl"
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
