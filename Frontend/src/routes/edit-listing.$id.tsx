import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Save, Star, Trash2 } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import { FormField, fieldInput } from "@/components/site/FormField";
import { CATEGORIES, CONDITIONS, GENDERS, SIZES } from "@/lib/taxonomy";
import { fetchListing, updateListing, type UpdateListingInput } from "@/lib/listings-api";
import { ApiError } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/edit-listing/$id")({
  head: () => ({
    meta: [
      { title: "Edit listing — Swapt" },
      { name: "description", content: "Update the details of one of your listings." },
    ],
  }),
  component: () => (
    <Protected>
      <EditListingPage />
    </Protected>
  ),
});

type FormState = {
  title: string; brand: string; description: string; category: string; gender: string;
  size: string; condition: string; color: string; value: string; retailValue: string;
  location: string; meetup: boolean; quantity: string; tags: string;
  material: string; fit: string; style: string; pattern: string; season: string;
  care: string; shippingDays: string; swapPreferences: string;
  returnWindowDays: string; returnPolicy: string;
};

function EditListingPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["listing", id],
    queryFn: () => fetchListing(id),
  });

  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoOrder, setPhotoOrder] = useState<{ urls: string[]; ids: string[] } | null>(null);
  // Photos the seller removed from the existing set, and brand-new photos picked
  // locally (object URLs shown in the grid, File objects uploaded on save).
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const [addedFiles, setAddedFiles] = useState<{ file: File; url: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const listing = data?.listing;

  useEffect(() => {
    if (!listing || form) return;
    setForm({
      title: listing.title ?? "",
      brand: listing.brand ?? "",
      description: listing.description ?? "",
      category: listing.category ?? "",
      gender: listing.gender ?? "Unisex",
      size: listing.size ?? "",
      condition: listing.condition ?? "",
      color: listing.color ?? "",
      value: listing.value != null ? String(listing.value) : "",
      retailValue: listing.retailValue != null ? String(listing.retailValue) : "",
      location: listing.location ?? "",
      meetup: Boolean(listing.meetup),
      quantity: listing.quantity != null ? String(listing.quantity) : "1",
      tags: (listing.tags ?? []).join(", "),
      material: listing.material ?? "",
      fit: listing.fit ?? "",
      style: listing.style ?? "",
      pattern: listing.pattern ?? "",
      season: listing.season ?? "",
      care: listing.care ?? "",
      shippingDays: listing.shippingDays ?? "",
      swapPreferences: listing.swapPreferences ?? "",
      returnWindowDays: listing.returnWindowDays != null ? String(listing.returnWindowDays) : "7",
      returnPolicy: listing.returnPolicy ?? "",
    });
    if (listing.images?.length && !photoOrder) {
      // Identifiers are publicIds in production, the URLs themselves in demo mode.
      setPhotoOrder({
        urls: listing.images,
        ids: (listing.imageIds?.length ? listing.imageIds : listing.images) as string[],
      });
    }
  }, [listing, form, photoOrder]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  const movePhoto = (index: number, dir: -1 | 1) =>
    setPhotoOrder((po) => {
      if (!po) return po;
      const target = index + dir;
      if (target < 0 || target >= po.urls.length) return po;
      const urls = [...po.urls];
      const ids = [...po.ids];
      [urls[index], urls[target]] = [urls[target], urls[index]];
      [ids[index], ids[target]] = [ids[target], ids[index]];
      return { urls, ids };
    });

  const setCover = (index: number) =>
    setPhotoOrder((po) => {
      if (!po || index === 0) return po;
      const urls = [...po.urls];
      const ids = [...po.ids];
      const [u] = urls.splice(index, 1);
      const [i] = ids.splice(index, 1);
      urls.unshift(u);
      ids.unshift(i);
      return { urls, ids };
    });

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (accepted.length !== files.length) {
      toast.error("Only image files can be added.");
    }
    setAddedFiles((prev) => [...prev, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  };

  const removePhoto = (index: number) => {
    setPhotoOrder((po) => {
      if (!po || index < 0 || index >= po.urls.length) return po;
      const removedId = po.ids[index];
      if (removedId) setRemovedIds((prev) => [...prev, removedId]);
      return { urls: po.urls.filter((_, i) => i !== index), ids: po.ids.filter((_, i) => i !== index) };
    });
  };

  const removeAddedPhoto = (index: number) => {
    setAddedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || busy) return;
    setError(null);
    const patch: UpdateListingInput = {
      title: form.title.trim(),
      brand: form.brand.trim(),
      description: form.description.trim(),
      category: form.category,
      gender: form.gender,
      size: form.size,
      condition: form.condition,
      color: form.color.trim(),
      value: Number(form.value) || undefined,
      retailValue: form.retailValue ? Number(form.retailValue) : undefined,
      location: form.location.trim(),
      meetup: form.meetup,
      quantity: Number(form.quantity) || 1,
      tags: form.tags,
      material: form.material.trim(),
      fit: form.fit,
      style: form.style,
      pattern: form.pattern,
      season: form.season,
      care: form.care.trim(),
      shippingDays: form.shippingDays.trim(),
      swapPreferences: form.swapPreferences.trim(),
      returnWindowDays: Number(form.returnWindowDays) as 0|7|14|30,
      returnPolicy: form.returnPolicy.trim(),
      imageOrder: photoOrder ? [...photoOrder.ids] : undefined,
      removeImages: removedIds.length ? removedIds : undefined,
      newImages: addedFiles.length ? addedFiles.map((f) => f.file) : undefined,
    };
    if (!patch.title || patch.title.length < 3) return setError("Title needs at least 3 characters.");
    if ((patch.description?.length ?? 0) < 10) return setError("Description needs at least 10 characters.");

    setBusy(true);
    try {
      await updateListing(id, patch);
      toast.success("Listing updated.");
      void navigate({ to: "/listing/$id", params: { id } });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.issues?.length
            ? err.issues.map((i) => `${i.path}: ${i.message}`).join(", ")
            : err.message
          : "Couldn't update the listing.";
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl px-4 py-6 md:px-8 md:py-10">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">Edit listing</h1>
        <p className="mt-1 text-sm text-foreground/60">Update the details, or reorder your photos — the first one is the cover.</p>

        {isLoading && (
          <div className="mt-8 flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-foreground/40" />
          </div>
        )}

        {!isLoading && (isError || !data) && (
          <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground/60">
            This listing couldn't be loaded. It may have been removed, or you may not own it.
          </div>
        )}

        {!isLoading && !isError && data && listing && form && (
          <form onSubmit={submit} className="mt-8 space-y-6">
            {photoOrder?.urls?.[0] && (
              <img
                src={photoOrder.urls[0]}
                alt={listing.title}
                className="aspect-[3/4] w-full max-w-[160px] rounded-2xl border border-border object-cover shadow-sm sm:w-40"
              />
            )}

            {photoOrder && (photoOrder.urls.length > 0 || addedFiles.length > 0) && (
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-black">Photos</h2>
                    <p className="text-xs text-foreground/50">Reorder with the arrows, remove with the bin — the first photo is your cover.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    multiple
                    className="hidden"
                    onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-2.5 text-sm min-h-11 font-bold text-foreground transition hover:bg-muted"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add photos
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {photoOrder?.urls.map((url, i) => (
                    <div key={url} className="relative aspect-square overflow-hidden rounded-xl border border-border">
                      <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 rounded-full bg-black/70 px-1.5 py-0.5 text-xs font-bold text-white">
                          Cover
                        </span>
                      )}
                      <div className="absolute inset-x-0 top-0 flex justify-between p-1">
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => movePhoto(i, -1)}
                          aria-label="Move photo left"
                          className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-neutral-700 shadow disabled:opacity-30 sm:h-8 sm:w-8"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={i === photoOrder.urls.length - 1}
                          onClick={() => movePhoto(i, 1)}
                          aria-label="Move photo right"
                          className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-neutral-700 shadow disabled:opacity-30 sm:h-8 sm:w-8"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="absolute inset-x-0 bottom-0 flex justify-between p-1">
                        {i > 0 ? (
                          <button
                            type="button"
                            onClick={() => setCover(i)}
                            aria-label="Make this the cover photo"
                            className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-amber-500 shadow transition-colors hover:bg-amber-50 sm:h-8 sm:w-8"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                        ) : <span />}
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          aria-label="Remove this photo"
                          className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-red-600 shadow transition-colors hover:bg-red-50 sm:h-8 sm:w-8"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {addedFiles.map((p, i) => (
                    <div key={p.url} className="relative aspect-square overflow-hidden rounded-xl border border-dashed border-border">
                      <img src={p.url} alt={`New photo ${i + 1}`} className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeAddedPhoto(i)}
                        aria-label="Remove this new photo"
                        className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-white/90 text-red-600 shadow transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Title">
                <input className={fieldInput} value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={120} />
              </FormField>
              <FormField label="Brand">
                <input className={fieldInput} value={form.brand} onChange={(e) => set("brand", e.target.value)} maxLength={60} />
              </FormField>
              <FormField label="Category">
                <select className={fieldInput} value={form.category} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="Department">
                <select className={fieldInput} value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </FormField>
              <FormField label="Size">
                <select className={fieldInput} value={form.size} onChange={(e) => set("size", e.target.value)}>
                  <option value="">Select size</option>
                  {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              <FormField label="Condition">
                <select className={fieldInput} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </FormField>
              <FormField label="Colour">
                <input className={fieldInput} value={form.color} onChange={(e) => set("color", e.target.value)} maxLength={40} />
              </FormField>
              <FormField label="Swap value (credits)" hint="What you'd like in return.">
                <input type="number" min={1} max={10000} className={fieldInput} value={form.value} onChange={(e) => set("value", e.target.value)} />
              </FormField>
              <FormField label="Retail value (£)" hint="Optional — shown for comparison.">
                <input type="number" min={0} max={10000} className={fieldInput} value={form.retailValue} onChange={(e) => set("retailValue", e.target.value)} />
              </FormField>
              <FormField label="Quantity" hint="More than 1 means it can be swapped multiple times.">
                <input type="number" min={1} max={50} className={fieldInput} value={form.quantity} onChange={(e) => set("quantity", e.target.value)} />
              </FormField>
            </div>

            <FormField label="Description" hint="At least 10 characters.">
              <textarea rows={5} maxLength={2000} className={fieldInput} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </FormField>

            <FormField label="Location" hint="Your city — helps local swaps.">
              <input className={fieldInput} value={form.location} onChange={(e) => set("location", e.target.value)} maxLength={120} />
            </FormField>

            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" checked={form.meetup} onChange={(e) => set("meetup", e.target.checked)} className="h-4 w-4 accent-[var(--color-brand)]" />
              Open to a local meetup instead of shipping
            </label>

            <FormField label="Tags" hint="Comma-separated, e.g. “vintage, oversized, y2k”.">
              <input className={fieldInput} value={form.tags} onChange={(e) => set("tags", e.target.value)} maxLength={120} />
            </FormField>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Material"><input className={fieldInput} value={form.material} onChange={(e) => set("material", e.target.value)} maxLength={40} /></FormField>
              <FormField label="Fit"><input className={fieldInput} value={form.fit} onChange={(e) => set("fit", e.target.value)} maxLength={30} /></FormField>
              <FormField label="Style"><input className={fieldInput} value={form.style} onChange={(e) => set("style", e.target.value)} maxLength={30} /></FormField>
              <FormField label="Pattern"><input className={fieldInput} value={form.pattern} onChange={(e) => set("pattern", e.target.value)} maxLength={30} /></FormField>
              <FormField label="Season"><input className={fieldInput} value={form.season} onChange={(e) => set("season", e.target.value)} maxLength={40} /></FormField>
              <FormField label="Shipping time"><input className={fieldInput} value={form.shippingDays} onChange={(e) => set("shippingDays", e.target.value)} maxLength={40} /></FormField>
            </div>

            <FormField label="Care"><input className={fieldInput} value={form.care} onChange={(e) => set("care", e.target.value)} maxLength={200} /></FormField>
            <FormField label="Swap preferences" hint="What you'd most like to swap for.">
              <input className={fieldInput} value={form.swapPreferences} onChange={(e) => set("swapPreferences", e.target.value)} maxLength={200} />
            </FormField>
            <FormField label="Return window" hint="Dispute window after delivery — clear policy for buyers.">
              <select className={fieldInput} value={form.returnWindowDays} onChange={(e) => set("returnWindowDays", e.target.value)}>
                <option value="0">No returns</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
                <option value="30">30 days</option>
              </select>
            </FormField>
            <FormField label="Return notes" hint="Optional — tags intact, buyer pays shipping etc.">
              <input className={fieldInput} value={form.returnPolicy} onChange={(e) => set("returnPolicy", e.target.value)} maxLength={300} placeholder="Buyer pays return shipping, tags required" />
            </FormField>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-brand-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                <Save className="h-4 w-4" /> Save changes
              </button>
              <Link
                to="/dashboard"
                className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </main>
      <Footer />
    </div>
  );
}