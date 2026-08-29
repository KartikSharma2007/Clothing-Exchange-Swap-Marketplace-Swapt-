import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Btn, Empty, Pagination, SearchInput, Table, Toolbar, Modal, Field, inputClass } from "@/components/admin/ui";
import { fetchAdminListings, toggleFeature, setListingStatus, removeListing, type AdminListing, type AdminQuery } from "@/lib/admin-api";
import { fetchListing, type ApiListing } from "@/lib/listings-api";
import { downloadApiCsv, toCsv } from "@/lib/csv";

export const Route = createFileRoute("/admin_/products")({
  head: () => ({
    meta: [
      { title: "Product management — Swapt admin" },
      { name: "description", content: "Approve, reject, feature, edit, merge, archive and bulk-manage every listing on the Swapt marketplace." },
      { property: "og:title", content: "Swapt product management" },
      { property: "og:description", content: "Moderation queues, bulk actions, featuring and category fixes for all listings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsPage,
});

const STATUSES = ["all", "active", "hidden", "swapped", "featured"] as const;

function ProductsPage() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [query, setQuery] = useState<AdminQuery>({ q: "", status: "all" });
  const { data, isLoading } = useQuery({ queryKey: ["admin", "listings", query], queryFn: () => fetchAdminListings(query) });

  const { data: detailResp, isLoading: isDetailLoading } = useQuery({
    queryKey: ["admin", "listing", detailId],
    queryFn: () => (detailId ? fetchListing(detailId) : Promise.resolve(null)),
    enabled: !!detailId,
  });

  const detailListing: ApiListing | null = detailResp ? detailResp.listing : null;

  // carousel state for detail images
  const [currentIndex, setCurrentIndex] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchDeltaRef = useRef(0);

  useEffect(() => {
    // reset index when opening a new detail
    setCurrentIndex(0);
  }, [detailId]);

  const showNext = () => {
    if (!detailListing || !detailListing.images || detailListing.images.length === 0) return;
    setCurrentIndex((i) => (i + 1) % detailListing.images.length);
  };
  const showPrev = () => {
    if (!detailListing || !detailListing.images || detailListing.images.length === 0) return;
    setCurrentIndex((i) => (i - 1 + detailListing.images.length) % detailListing.images.length);
  };

  const onTouchStart = (e: any) => {
    touchStartXRef.current = e.touches?.[0]?.clientX ?? null;
    touchDeltaRef.current = 0;
  };
  const onTouchMove = (e: any) => {
    if (touchStartXRef.current == null) return;
    touchDeltaRef.current = e.touches?.[0]?.clientX - touchStartXRef.current;
  };
  const onTouchEnd = () => {
    const delta = touchDeltaRef.current;
    const threshold = 50;
    if (delta > threshold) showPrev();
    else if (delta < -threshold) showNext();
    touchStartXRef.current = null;
    touchDeltaRef.current = 0;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") showPrev();
    if (e.key === "ArrowRight") showNext();
  };

  const toggle = useMutation({
    mutationFn: ({ listing, reason }: { listing: AdminListing; reason: string }) => toggleFeature(listing, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "listings"] }),
  });

  const setStatus = useMutation({
    mutationFn: ({ listing, status, reason }: { listing: AdminListing; status: "active" | "hidden"; reason: string }) =>
      setListingStatus(listing, status, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "listings"] }),
  });

  const delete_ = useMutation({
    mutationFn: ({ listing, reason }: { listing: AdminListing; reason: string }) => removeListing(listing, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "listings"] }),
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pages = data?.pages ?? 1;

  const goPage = (p: number) => {
    setQuery((prev) => ({ ...prev, page: p }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const setDetailForListing = (l: AdminListing) => setDetailId(l.id);

  return (
    <AdminLayout title="Listing moderation" subtitle={`${total} total listings · Showing ${rows.length} of ${total} (page ${page} of ${pages})`}>
      <Toolbar>
        <SearchInput value={query.q} onChange={(q) => setQuery((prev) => ({ ...prev, q, page: 1 }))} placeholder="Search title, brand or seller…" />
        <select
          className="h-9 rounded-md border border-border bg-background px-2 text-sm"
          value={query.status}
          onChange={(e) => setQuery((prev) => ({ ...prev, status: e.target.value as AdminQuery["status"], page: 1 }))}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            const fallback = () =>
              toCsv(
                ["id", "title", "brand", "category", "size", "condition", "value", "status", "featured", "createdAt"],
                rows.map((r) => [r.id, r.title, r.brand, r.category, r.size, r.condition, r.value, r.status, r.featured ? "true" : "false", r.createdAt]),
              );
            void downloadApiCsv("/api/admin/listings/export.csv", "swapt-all-listings.csv", fallback);
          }}
          className="h-9 rounded-md border border-border bg-background px-3 text-sm font-semibold transition-colors hover:bg-muted"
        >
          Export CSV
        </button>
      </Toolbar>

      {isLoading ? (
        <Empty label="Loading listings…" />
      ) : rows.length === 0 ? (
        <Empty label="No listings match those filters." />
      ) : (
        <>
          <Table head={["Item", "Seller", "Status", "Featured", "Actions"]}>
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-muted/30">
              <td data-label="Item" className="px-3 py-2.5">
                <div className="flex items-center gap-3">
                  {l.images && l.images.length > 0 ? (
                    <img src={l.images[0]} alt={l.title + " cover"} className="h-12 w-12 rounded-md object-cover" />
                  ) : (
                    <div className="h-12 w-12 rounded-md bg-muted" />
                  )}
                  <div>
                    <span className="block font-semibold">{l.title}</span>
                    <span className="block text-xs text-foreground/55">{l.brand} · {l.size} · {l.condition}</span>
                  </div>
                </div>
              </td>
              <td data-label="Seller" className="px-3 py-2.5 text-xs">
                {l.seller.name}
                <span className="block text-foreground/50">@{l.seller.username}</span>
              </td>
              <td data-label="Status" className="px-3 py-2.5 text-xs">{l.status}</td>
              <td data-label="Featured" className="px-3 py-2.5 text-xs">{l.featured ? "★ Yes" : "No"}</td>
              <td data-label="Actions" className="px-3 py-2.5">
                <div className="flex flex-wrap gap-1">
                  <Btn onClick={() => setConfirm({ type: "status", listing: l, defaultStatus: l.status === "active" ? "hidden" : "active" })}>
                    {l.status === "active" ? "Hide" : "Show"}
                  </Btn>
                  <Btn onClick={() => setConfirm({ type: "feature", listing: l })}>{l.featured ? "Unfeature" : "Feature"}</Btn>
                  <Btn variant="danger" onClick={() => setConfirm({ type: "delete", listing: l })}>Delete</Btn>
                  <Btn onClick={() => setDetailForListing(l)}>See details</Btn>
                </div>
              </td>
            </tr>
          ))}
        </Table>
        <Pagination page={page} pages={pages} onPage={goPage} />
      </>
      )}
      {confirm && (
        <ConfirmModal
          state={confirm}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => {
            if (!confirm) return;
            if (confirm.type === "status") {
              setStatus.mutate({ listing: confirm.listing, status: confirm.defaultStatus, reason });
            } else if (confirm.type === "feature") {
              toggle.mutate({ listing: confirm.listing, reason });
            } else if (confirm.type === "delete") {
              delete_.mutate({ listing: confirm.listing, reason });
            }
          }}
        />
      )}

      {detailId && (
        <Modal title={detailListing ? detailListing.title : "Listing details"} onClose={() => setDetailId(null)}>
          <div>
            <div className="sticky top-0 z-20 -mt-3 flex justify-end pr-4">
                          <button onClick={() => setDetailId(null)} className="h-9 w-9 -translate-y-3 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted" aria-label="Close details">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
            {/* Image gallery */}
            {isDetailLoading && (
              <div className="p-4 text-sm text-foreground/60">Loading full listing…</div>
            )}

            {detailListing && (
              <>
                {detailListing.images && detailListing.images.length > 0 && (
                  <div
                    className="grid gap-2"
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onKeyDown={onKeyDown}
                    tabIndex={0}
                  >
                    <div className="relative">
                      <div className="overflow-hidden rounded-md">
                        <div className="flex transition-transform duration-300 ease-in-out" style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
                          {detailListing.images.map((src, i) => (
                            <div key={i} className="w-full flex-shrink-0">
                              <img src={src} alt={`${detailListing.title} ${i + 1}`} className="w-full h-64 sm:h-[420px] object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Prev/Next controls */}
                      <button
                        onClick={showPrev}
                        aria-label="Previous image"
                        className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
                      >
                        ◀
                      </button>
                      <button
                        onClick={showNext}
                        aria-label="Next image"
                        className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 items-center justify-center rounded-full border border-border bg-background hover:bg-muted"
                      >
                        ▶
                      </button>
                    </div>

                    <div className="flex gap-2 overflow-x-auto py-2">
                      {detailListing.images.map((src, i) => (
                        <button
                          key={i}
                          onClick={() => setCurrentIndex(i)}
                          className={`h-16 w-16 flex-shrink-0 rounded-md overflow-hidden border ${i === currentIndex ? "ring-2 ring-brand" : "border-border"}`}
                        >
                          <img src={src} alt={`${detailListing.title} ${i + 1}`} className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>

                    {/* Dots for mobile */}
                    <div className="flex justify-center gap-2">
                      {detailListing.images.map((_, i) => (
                        <button key={i} onClick={() => setCurrentIndex(i)} className={`h-2 w-2 rounded-full ${i === currentIndex ? "bg-brand" : "bg-muted"}`} aria-label={`Go to image ${i + 1}`} />
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-sm text-foreground/70">Seller: <span className="font-semibold">{detailListing.seller.name} (@{detailListing.seller.username})</span></p>

                {/* Core fields */}
                <Field label="Title"><input className={inputClass} value={detailListing.title ?? "User did not provide"} disabled /></Field>
                <Field label="Brand"><input className={inputClass} value={detailListing.brand ?? "User did not provide"} disabled /></Field>
                <Field label="Category"><input className={inputClass} value={(detailListing as any).category ?? "User did not provide"} disabled /></Field>
                <Field label="Size"><input className={inputClass} value={detailListing.size ?? "User did not provide"} disabled /></Field>
                <Field label="Condition"><input className={inputClass} value={detailListing.condition ?? "User did not provide"} disabled /></Field>
                <Field label="Color"><input className={inputClass} value={(detailListing as any).color ?? "User did not provide"} disabled /></Field>
                <Field label="Value (swap credits)"><input className={inputClass} value={detailListing.value != null ? String(detailListing.value) : "User did not provide"} disabled /></Field>
                <Field label="Retail value"><input className={inputClass} value={String((detailListing as any).retailValue ?? "User did not provide")} disabled /></Field>

                {/* Description and rich fields */}
                <Field label="Description"><textarea className="w-full rounded-md border border-border px-3 py-2 text-sm" rows={5} value={(detailListing as any).description ?? "User did not provide"} disabled /></Field>

                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Material"><input className={inputClass} value={(detailListing as any).material ?? "User did not provide"} disabled /></Field>
                  <Field label="Fit"><input className={inputClass} value={(detailListing as any).fit ?? "User did not provide"} disabled /></Field>
                  <Field label="Style"><input className={inputClass} value={(detailListing as any).style ?? "User did not provide"} disabled /></Field>
                  <Field label="Pattern"><input className={inputClass} value={(detailListing as any).pattern ?? "User did not provide"} disabled /></Field>
                  <Field label="Season"><input className={inputClass} value={(detailListing as any).season ?? "User did not provide"} disabled /></Field>
                  <Field label="Care"><input className={inputClass} value={(detailListing as any).care ?? "User did not provide"} disabled /></Field>
                </div>

                {/* Measurements */}
                {(detailListing as any).measurements ? (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground/55">Measurements</p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {Object.entries((detailListing as any).measurements).map(([k, v]) => (
                        <div key={k} className="rounded-lg border border-border bg-muted/40 p-2 text-sm">{k}: {String(v)}</div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-foreground/60">User did not provide measurements</p>
                )}

                {/* Tags, quantity, shipping */}
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Tags"><input className={inputClass} value={((detailListing as any).tags ?? []).length ? ((detailListing as any).tags ?? []).join(", ") : "User did not provide"} disabled /></Field>
                  <Field label="Quantity"><input className={inputClass} value={((detailListing as any).quantity ?? null) != null ? String((detailListing as any).quantity) : "User did not provide"} disabled /></Field>
                  <Field label="Ships from"><input className={inputClass} value={(detailListing as any).shipsFrom ?? "User did not provide"} disabled /></Field>
                  <Field label="Shipping days"><input className={inputClass} value={(detailListing as any).shippingDays ?? "User did not provide"} disabled /></Field>
                </div>

                <Field label="Swap preferences"><input className={inputClass} value={(detailListing as any).swapPreferences ?? "User did not provide"} disabled /></Field>

                <div className="flex gap-2">
                  <Field label="Views"><input className={inputClass} value={String((detailListing as any).views ?? "User did not provide")} disabled /></Field>
                  <Field label="Saves"><input className={inputClass} value={String((detailListing as any).saves ?? "User did not provide")} disabled /></Field>
                </div>

                <Field label="Location"><input className={inputClass} value={(detailListing as any).location ?? "User did not provide"} disabled /></Field>
                <Field label="Posted"><input className={inputClass} value={(detailListing as any).postedDaysAgo != null ? `${(detailListing as any).postedDaysAgo} days ago` : "User did not provide"} disabled /></Field>
              </>
            )}

          </div>
          </div>
        </Modal>
      )}    </AdminLayout>
  );
}

type ConfirmState =
  | null
  | { type: "status"; listing: AdminListing; defaultStatus: "active" | "hidden" }
  | { type: "feature"; listing: AdminListing }
  | { type: "delete"; listing: AdminListing };

function ConfirmModal({ state, onClose, onConfirm }: { state: ConfirmState; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  if (!state) return null;
  const title = state.type === "status" ? `Change listing status` : state.type === "feature" ? `Feature listing` : `Delete listing`;
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm text-foreground/70">Item: <span className="font-semibold">{state.listing.title}</span></p>
      <label className="block mt-4">
        <span className="block text-xs font-semibold">Reason</span>
        <textarea rows={4} className="w-full rounded-md border border-border px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      <div className="mt-4 flex gap-2">
        <button onClick={() => { onConfirm(reason); onClose(); }} className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground">Confirm</button>
        <button onClick={onClose} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
      </div>
    </Modal>
  );
}