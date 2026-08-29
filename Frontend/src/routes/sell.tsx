import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { BadgeDollarSign, Check, ChevronDown, ChevronRight, Coins, Crop, ImagePlus, Loader2, LocateFixed, MapPin, Palette, RotateCcw, Shirt, Sparkles, Tag, Upload, X } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import { MeasurementsSection } from "@/components/site/MeasurementsSection";
import { CATEGORIES, SIZES, CONDITIONS, GENDERS, FITS, STYLES, MATERIALS } from "@/lib/taxonomy";
import { createListing, fileToJpeg, importListingsCsv, suggestListingFromImage, type ImportResult } from "@/lib/listings-api";
import { clearDraft, dataUrlToFile, fileToDataUrl, loadDraft, saveDraft } from "@/lib/listing-draft";
import { toast } from "sonner";
import ImageCropper from "@/components/site/ImageCropper";
import { apiEnabled, ApiError, getAccessToken } from "@/lib/api";
import { FormField, fieldInput } from "@/components/site/FormField";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sell")({
  head: () => ({
    meta: [
      { title: "List an item — Swapt" },
      { name: "description", content: "Upload photos and list a preloved piece for swapping on Swapt." },
      { property: "og:title", content: "List an item — Swapt" },
      { property: "og:description", content: "Upload photos and list a preloved piece for swapping." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <Protected>
      <SellPage />
    </Protected>
  ),
});

const MAX_FILES = 6;
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif"];

const conditions = CONDITIONS;
const genders = GENDERS;
const categories = CATEGORIES;
const sizes = SIZES;
const seasons = ["All season", "Spring / Summer", "Autumn / Winter", "Summer", "Winter"] as const;
const patterns = ["Solid", "Print", "Striped", "Checked", "Graphic", "Floral", "Camo"] as const;

/** Numbered card section with a "Complete" state for the required steps.
 *  Optional sections are collapsible so the page stays short and scannable. */
function Section({ step, title, desc, done, optional, id, children }: { step: number; title: string; desc?: string; done?: boolean; optional?: boolean; id?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section id={id} className="rounded-3xl border border-border bg-card p-5 shadow-sm transition-shadow duration-300 hover:shadow-md md:p-7 scroll-mt-24 max-md:rounded-2xl max-md:p-3 max-md:shadow-sm max-md:border-border/60">
      <button
        type="button"
        onClick={() => optional && setOpen((v) => !v)}
        className={cn("flex w-full items-center gap-3 text-left", optional ? "cursor-pointer" : "cursor-default")}
      >
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-sm font-black transition-colors duration-300",
            done ? "bg-emerald-100 text-emerald-600" : "bg-brand/10 text-brand",
          )}
        >
          {done ? <Check className="h-4 w-4" /> : step}
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-black tracking-tight md:text-lg">{title}</h2>
          {desc && <p className="text-xs text-foreground/55">{desc}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {optional && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-foreground/50">Optional</span>}
          {done && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-600">Complete</span>}
          {optional && (
            <ChevronDown
              className={cn("h-4 w-4 text-foreground/40 transition-transform duration-200", open && "rotate-180")}
            />
          )}
        </div>
      </button>
      {open && <div className="mt-5">{children}</div>}
    </section>
  );
}

/** Live, updating preview of the listing — shown in the sidebar (desktop)
 *  and as a compact card on mobile. */
function ListingPreview({ preview, cover, compact = false }: { preview: Record<string, string>; cover?: string; compact?: boolean }) {
  const done = {
    photo: !!cover,
    basics: Boolean(preview.title && preview.category && preview.size && preview.condition),
    value: Number(preview.value) > 0,
    story: (preview.description?.length ?? 0) >= 10,
  };
  const score = Object.values(done).filter(Boolean).length;

  const strengthBar = (className: string) => (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-border", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-500", score >= 3 ? "bg-emerald-500" : "bg-brand")}
        style={{ width: `${(score / 4) * 100}%` }}
      />
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/50">
          {cover ? (
            <img src={cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-foreground/40">
              <ImagePlus className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{preview.title || "Your listing title"}</p>
          <p className="mt-0.5 text-xs text-foreground/50">
            {score}/4 complete · {Number(preview.value) > 0 ? `${preview.value} cr` : "set a swap value"}
          </p>
          <div className="mt-1.5">{strengthBar("h-1")}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-border bg-muted/50">
        {cover ? (
          <img src={cover} alt="Cover preview" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-foreground/40">
            <ImagePlus className="h-7 w-7" />
            <span className="px-4 text-center text-xs font-semibold">Cover photo appears here</span>
          </div>
        )}
        <span className="absolute right-2 top-2 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-foreground">
          Swap
        </span>
        {Number(preview.value) > 0 && (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white">
            {preview.value} cr
          </span>
        )}
      </div>

      <p className="mt-3 truncate font-black tracking-tight">{preview.title || "Your listing title"}</p>
      <p className="mt-0.5 truncate text-xs text-foreground/55">
        {[preview.brand, preview.category, preview.size].filter(Boolean).join(" · ") || "Brand · Category · Size"}
      </p>
      <p className="mt-1 text-xs text-foreground/45">{preview.condition || "Condition"}</p>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between text-xs font-bold">
          <span className="uppercase tracking-wider text-foreground/45">Listing strength</span>
          <span className={score === 4 ? "text-emerald-600" : "text-foreground/60"}>{score}/4</span>
        </div>
        <div className="mt-1.5">{strengthBar("")}</div>
        <ul className="mt-3 space-y-1.5 text-xs">
          {([
            ["Cover photo", done.photo],
            ["Basics complete", done.basics],
            ["Swap value set", done.value],
            ["A good story", done.story],
          ] as [string, boolean][]).map(([label, ok]) => (
            <li key={label} className={cn("flex items-center gap-1.5 transition-colors", ok ? "text-emerald-600" : "text-foreground/45")}>
              <span className={cn("grid h-4 w-4 place-items-center rounded-full", ok ? "bg-emerald-100 text-emerald-600" : "bg-muted text-foreground/40")}>
                <Check className="h-2.5 w-2.5" />
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SellPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fields, setFields] = useState({
    title: "",
    brand: "",
    category: "",
    color: "",
    condition: "",
    size: "",
  });
  const [preview, setPreview] = useState<Record<string, string>>({
    title: "", brand: "", category: "", color: "", size: "", condition: "", value: "", description: "",
  });
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [meetup, setMeetup] = useState(false);
  const [coords, setCoords] = useState({ lat: "", lng: "" });
  const [locBusy, setLocBusy] = useState(false);
  const [locError, setLocError] = useState("");
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<ImportResult | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [formTick, setFormTick] = useState(0);
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [cropping, setCropping] = useState<{ index: number; src: string } | null>(null);
  // New: Return window per listing + scheduling
  const [returnWindow, setReturnWindow] = useState<0 | 7 | 14 | 30>(7);
  const [returnPolicyText, setReturnPolicyText] = useState("");
  const [publishAt, setPublishAt] = useState("");
  const [draftSaving, setDraftSaving] = useState(false);

  const runBulkImport = async () => {
    if (!bulkFile || bulkBusy) return;
    setBulkBusy(true);
    setError(null);
    try {
      setBulkResult(await importListingsCsv(bulkFile));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBulkBusy(false);
    }
  };

  const setMeasure = (key: string, value: string) => setMeasures((m) => ({ ...m, [key]: value }));

  const setField = (key: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFields((f) => ({ ...f, [key]: e.target.value }));

  /** Keep the live preview in sync with whatever the seller is typing. */
  const onFormChange = (e: React.FormEvent<HTMLFormElement>) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (t && t.name && t.name in preview) setPreview((p) => ({ ...p, [t.name]: t.value }));
    setFormTick((v) => v + 1);
  };

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  // Keep small data-URL copies of the photos so a full draft can be restored.
  useEffect(() => {
    let alive = true;
    (async () => {
      const urls = await Promise.all(files.map((f) => fileToDataUrl(f, 512)));
      if (alive) setDraftImages(urls);
    })();
    return () => { alive = false; };
  }, [files]);

  // Debounced autosave — text fields, measurements, meetup + photos.
  useEffect(() => {
    const t = setTimeout(() => {
      const el = formRef.current;
      if (!el) return;
      const fd = new FormData(el);
      const form: Record<string, string> = {};
      fd.forEach((v, k) => { if (typeof v === "string") form[k] = v; });
      const hasContent = files.length > 0 || fields.title.trim() !== "" || fields.brand.trim() !== "" || (form.description ?? "").trim() !== "";
      if (!hasContent) return;
      saveDraft({ fields, form, measurements: measures, meetup, coords, images: draftImages, savedAt: new Date().toISOString() });
      setDraftSavedAt(new Date());
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, measures, meetup, coords, draftImages, formTick]);

  // Restore the saved draft on first load.
  useEffect(() => {
    const draft = loadDraft();
    if (!draft) return;
    const hasAny = Boolean(draft.fields.title || draft.fields.brand || draft.images.length || Object.values(draft.form).some((v) => v.trim() !== ""));
    if (!hasAny) return;
    setFields((f) => ({ ...f, ...draft.fields }));
    setMeasures(draft.measurements);
    setMeetup(draft.meetup);
    setCoords(draft.coords);
    setPreview((p) => ({ ...p, ...draft.form }));
    const el = formRef.current;
    if (el) {
      const els = el.elements;
      for (const [name, value] of Object.entries(draft.form)) {
        const input = els.namedItem(name);
        if (input && "value" in input) (input as { value: string }).value = value;
      }
    }
    if (draft.images.length) setFiles(draft.images.map((src, i) => dataUrlToFile(src, `draft-${i}.jpg`)));
    setDraftRestored(true);
     
  }, []);

  const discardDraft = () => {
    clearDraft();
    setDraftRestored(false);
    setDraftSavedAt(null);
    setFiles([]);
    setFields({ title: "", brand: "", category: "", color: "", condition: "", size: "" });
    setMeasures({});
    setMeetup(false);
    setCoords({ lat: "", lng: "" });
    setPreview({ title: "", brand: "", category: "", color: "", size: "", condition: "", value: "", description: "" });
    formRef.current?.reset();
  };

  /** Replace the cropped photo in place — the cover previews update instantly. */
  const applyCrop = (file: File) => {
    if (cropping) setFiles((prev) => prev.map((f, i) => (i === cropping.index ? file : f)));
    setCropping(null);
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setError(null);
    const incoming = Array.from(list);
    for (const f of incoming) {
      if (!ACCEPT.includes(f.type)) return setError("Only JPEG, PNG, WebP or AVIF images are allowed.");
      if (f.size > MAX_BYTES) return setError(`${f.name} is larger than 8 MB.`);
    }
    const room = MAX_FILES - files.length;
    if (incoming.length > room) {
      const kept = Math.max(room, 0);
      const dropped = incoming.length - kept;
      setError(`Only ${MAX_FILES} photos allowed — ${dropped} extra photo${dropped > 1 ? "s were" : " was"} ignored.`);
    }
    setFiles((prev) => [...prev, ...incoming].slice(0, MAX_FILES));
  };

  /** Ask the vision model to fill the listing fields from the first photo. */
  const runAiSuggest = async () => {
    const photo = files[0];
    if (!photo || aiBusy) return;
    setAiError(null);
    setAiBusy(true);
    try {
      if (!apiEnabled) throw new Error("Set VITE_API_URL and start the API to use AI-assisted listing.");
      const jpeg = await fileToJpeg(photo);
      const { suggestion } = await suggestListingFromImage(jpeg);
      setFields((f) => ({
        title: suggestion.title || f.title,
        brand: suggestion.brand || f.brand,
        category: suggestion.category || f.category,
        color: suggestion.color || f.color,
        condition: suggestion.condition || f.condition,
        size: suggestion.size || f.size,
      }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Couldn't analyse the photo. Try again.");
    } finally {
      setAiBusy(false);
    }
  };

  /** Grab the browser's location to pre-fill the meetup coordinates. */
  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocError("Location isn't supported in this browser."); return; }
    setLocBusy(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) });
        setLocBusy(false);
      },
      () => { setLocError("Couldn't get your location — allow it and try again."); setLocBusy(false); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const buildPayload = (fd: FormData, status: "active" | "draft" | "scheduled" = "active") => ({
    title: String(fd.get("title") || ""),
    brand: String(fd.get("brand") || ""),
    description: String(fd.get("description") || ""),
    category: String(fd.get("category") || ""),
    gender: String(fd.get("gender") || "Unisex"),
    size: String(fd.get("size") || ""),
    condition: String(fd.get("condition") || ""),
    color: String(fd.get("color") || ""),
    value: Number(fd.get("value") || 0),
    location: String(fd.get("location") || ""),
    meetup: fd.get("meetup") === "on",
    lat: fd.get("lat") ? Number(fd.get("lat")) : undefined,
    lng: fd.get("lng") ? Number(fd.get("lng")) : undefined,
    retailValue: Number(fd.get("retailValue") || 0) || undefined,
    material: String(fd.get("material") || ""),
    fit: String(fd.get("fit") || ""),
    style: String(fd.get("style") || ""),
    pattern: String(fd.get("pattern") || ""),
    season: String(fd.get("season") || ""),
    care: String(fd.get("care") || ""),
    tags: String(fd.get("tags") || ""),
    quantity: Number(fd.get("quantity") || 1),
    shippingDays: String(fd.get("shippingDays") || ""),
    swapPreferences: String(fd.get("swapPreferences") || ""),
    chest: String(fd.get("chest") || ""),
    waist: String(fd.get("waist") || ""),
    hips: String(fd.get("hips") || ""),
    length: String(fd.get("length") || ""),
    inseam: String(fd.get("inseam") || ""),
    shoulder: String(fd.get("shoulder") || ""),
    sleeve: String(fd.get("sleeve") || ""),
    status,
    publishAt: publishAt || undefined,
    returnWindowDays: returnWindow as 0 | 7 | 14 | 30,
    returnPolicy: returnPolicyText,
    images: files,
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!apiEnabled) return setError("Set VITE_API_URL and start the API in /server to publish listings.");
    if (!getAccessToken()) return setError("Log in first — publishing a listing requires an account.");

    const fd = new FormData(e.currentTarget);
    const isScheduled = Boolean(publishAt && new Date(publishAt).getTime() > Date.now());
    const status: "active" | "scheduled" = isScheduled ? "scheduled" : "active";
    if (status === "active" && files.length === 0) return setError("Add at least one photo.");

    setSubmitting(true);
    try {
      const payload = buildPayload(fd, status);
      const { listing, moderation } = await createListing(payload as any);
      if (moderation?.status === "flagged") {
        setError(`Flagged for review (${moderation.reason}). It will appear after approval.`);
      }
      clearDraft();
      navigate({ to: "/listing/$id", params: { id: listing.id } });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.issues?.length
            ? err.issues.map((i) => `${i.path}: ${i.message}`).join(", ")
            : err.message
          : "Upload failed. Check the API server is running.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const onSaveDraft = async () => {
    setError(null);
    if (!apiEnabled) return setError("Set VITE_API_URL and start the API to save drafts.");
    if (!getAccessToken()) return setError("Log in first.");
    setDraftSaving(true);
    try {
      const el = formRef.current;
      const fd = el ? new FormData(el) : new FormData();
      // Ensure at least title for draft
      const title = String(fd.get("title") || fields.title || "Untitled draft");
      fd.set("title", title);
      const payload = buildPayload(fd, "draft");
      // Drafts may have 0 images — okay
      const { listing } = await createListing(payload as any);
      clearDraft();
      toast?.success?.("Draft saved — find it in Dashboard → Drafts");
      navigate({ to: "/dashboard" });
      return listing;
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Couldn't save draft.";
      setError(message);
    } finally {
      setDraftSaving(false);
    }
  };

  const basicsDone = Boolean(
    fields.title && fields.brand && fields.category && fields.size && fields.condition && fields.color && Number(preview.value) > 0,
  );
  const storyDone = (preview.description?.length ?? 0) >= 10;

  /** Preview derives the controlled fields from `fields` state so it stays in
   *  sync even when values are set programmatically (e.g. AI auto-fill), not
   *  just by typing. */
  const livePreview = {
    ...preview,
    title: fields.title,
    brand: fields.brand,
    category: fields.category,
    color: fields.color,
    condition: fields.condition,
    size: fields.size,
  };

  return (
    <div className="min-h-dvh bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-5xl px-4 pb-32 pt-6 md:px-8 md:pt-10 lg:pb-20 max-md:px-4 max-md:pt-5 max-md:pb-36 max-md:scroll-pb-36">
        {/* Hero — mobile compact */}
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card px-5 py-7 shadow-sm md:px-8 md:py-9 max-md:rounded-2xl max-md:px-4 max-md:py-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_100%_0%,rgba(224,53,58,0.10),transparent_60%),radial-gradient(45%_50%_at_0%_100%,rgba(224,53,58,0.06),transparent_60%)]" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/25 bg-brand/10 px-3 py-2 text-sm min-h-9 font-bold text-brand">
            <Sparkles className="h-3.5 w-3.5" /> AI-assisted listing
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-tight md:text-4xl">List an item</h1>
          <p className="mt-1.5 max-w-lg text-sm text-foreground/60">
            Snap a photo, let AI pre-fill the details, and watch the swap offers roll in. Photos are stored privately
            in Cloudinary until you publish.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3 text-xs font-bold text-foreground/70">
            {["Add photos", "Fill the details", "Publish"].map((s, i) => (
              <span key={s} className="flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-brand/10 text-xs text-brand">{i + 1}</span>
                {s}
                {i < 2 && <ChevronRight className="h-3.5 w-3.5 text-foreground/30" />}
              </span>
            ))}
          </div>

          <nav className="mt-5 flex flex-wrap gap-2" aria-label="Jump to a section">
            {[
              ["s-photos", "Photos"],
              ["s-basics", "Basics"],
              ["s-story", "Story"],
              ["s-details", "Details"],
              ["s-measurements", "Measurements"],
              ["s-care", "Care & shipping"],
              ["s-bulk", "Bulk import"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={`#${href}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(href)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="rounded-full border border-border bg-background px-3 py-2.5 text-sm min-h-11 font-bold text-foreground/60 transition-colors hover:border-brand/40 hover:text-brand"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>

        {draftRestored && (
          <div className="animate-fade-in mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-900">
              <span className="font-bold">Draft restored.</span> We saved your last session — it's all still here.
            </p>
            <button
              type="button"
              onClick={discardDraft}
              className="inline-flex shrink-0 items-center gap-1.5 text-xs font-bold text-amber-700 underline underline-offset-2 transition-colors hover:text-amber-900"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Discard draft
            </button>
          </div>
        )}

        <form ref={formRef} onSubmit={onSubmit} onChange={onFormChange} className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* ── Left column: form sections ─────────────────────────── */}
            <div className="space-y-5">
              {/* Mobile live preview */}
              <div className="rounded-3xl border border-border bg-card p-4 shadow-sm lg:hidden">
                <p className="mb-3 text-xs font-bold uppercase tracking-widest text-foreground/40">Live preview</p>
                <ListingPreview preview={livePreview} cover={previews[0]} compact />
              </div>

              {/* 1 · Photos */}
              <Section step={1} title="Photos" desc="Show every angle — swappers decide in seconds." done={files.length > 0} id="s-photos">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => inputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click(); }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
                  onTouchStart={() => setDragging(true)}
                  onTouchEnd={() => setDragging(false)}
                  onTouchMove={(e) => { if (e.touches.length) e.preventDefault(); }}
                  className={cn(
                    "group relative flex cursor-pointer touch-manipulation flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-200 max-md:rounded-2xl max-md:px-4 max-md:py-8 max-md:touch-manipulation",
                    dragging
                      ? "scale-[1.01] border-brand bg-brand/[0.04]"
                      : "border-border bg-muted/30 hover:border-brand/50 hover:bg-muted/50",
                  )}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-background shadow-sm transition-transform duration-200 group-hover:scale-105">
                    <ImagePlus className="h-6 w-6 text-brand" />
                  </span>
                  <span className="text-sm font-bold">
                    Drop photos here or <span className="text-brand underline underline-offset-2">browse</span>
                  </span>
                  <span className="text-xs text-foreground/50">JPEG, PNG, WebP or AVIF · up to 8 MB · {MAX_FILES} max</span>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPT.join(",")}
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                  {previews.length > 0 && (
                  <div className="mt-4 space-y-4 max-md:space-y-3">
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6 max-md:gap-2.5 max-md:grid-cols-3">
                      {previews.map((src, i) => (
                        <div key={src} className="relative aspect-square overflow-hidden rounded-2xl border border-border touch-manipulation">
                          <img src={src} alt={`Upload preview ${i + 1}`} className="h-full w-full object-cover" />
                          <button
                            type="button"
                            aria-label={`Crop photo ${i + 1}`}
                            onClick={() => setCropping({ index: i, src })}
                            className="absolute bottom-1.5 right-1.5 grid h-10 w-10 place-items-center rounded-full bg-background/90 shadow-md backdrop-blur transition-colors hover:bg-brand hover:text-brand-foreground sm:h-8 sm:w-8 max-md:h-9 max-md:w-9"
                          >
                            <Crop className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove photo ${i + 1}`}
                            onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute right-1.5 top-1.5 grid h-10 w-10 place-items-center rounded-full bg-background/90 shadow-md backdrop-blur transition-colors hover:bg-destructive hover:text-background sm:h-8 sm:w-8 max-md:h-9 max-md:w-9"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                          {i === 0 && (
                            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-white max-md:px-2 max-md:py-1 max-md:text-[10px]">
                              Cover
                            </span>
                          )}
                          {/* Mobile touch reorder — finger friendly */}
                          <div className="absolute inset-x-1 top-1/2 hidden -translate-y-1/2 justify-between max-md:flex">
                            <button type="button" aria-label="Move left" onClick={() => setFiles(prev => { if(i===0) return prev; const a=[...prev]; [a[i],a[i-1]]=[a[i-1],a[i]]; return a; })} disabled={i===0} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur disabled:opacity-30 active:bg-black/80">
                              <ChevronDown className="h-3 w-3 rotate-90" />
                            </button>
                            <button type="button" aria-label="Move right" onClick={() => setFiles(prev => { if(i===prev.length-1) return prev; const a=[...prev]; [a[i],a[i+1]]=[a[i+1],a[i]]; return a; })} disabled={i===previews.length-1} className="grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white backdrop-blur disabled:opacity-30 active:bg-black/80">
                              <ChevronDown className="h-3 w-3 -rotate-90" />
                            </button>
                          </div>
                        </div>
                      ))}
                      {files.length < MAX_FILES && (
                        <button
                          type="button"
                          onClick={() => inputRef.current?.click()}
                          className="grid aspect-square place-items-center rounded-2xl border-2 border-dashed border-border text-foreground/50 transition-colors hover:border-brand/50 hover:text-brand"
                        >
                          <span className="flex flex-col items-center gap-1 text-xs font-semibold">
                            <ImagePlus className="h-5 w-5" /> Add
                          </span>
                        </button>
                      )}
                    </div>

                    <div className="flex min-h-[104px] flex-col gap-3 rounded-2xl border border-brand/20 bg-brand/[0.04] p-3.5 sm:flex-row sm:items-center sm:justify-between max-md:min-h-[138px] max-md:p-4 max-md:gap-3 max-md:rounded-2xl">
                      <div>
                        <p className="text-sm font-bold max-md:text-[13px]">Let AI write the listing</p>
                        <p className="text-xs text-foreground/55 max-md:text-[11px] max-md:leading-tight">
                          Detects title, brand, colour, category, condition and size from your first photo.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={runAiSuggest}
                        disabled={aiBusy}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand/85 px-4 py-2.5 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/25 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 max-md:min-h-11 max-md:w-full max-md:justify-center max-md:py-3 max-md:text-sm"
                      >
                        {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {aiBusy ? "Analysing photo…" : "Auto-fill with AI"}
                      </button>
                    </div>
                    {aiError && <p className="text-xs font-medium text-destructive">{aiError}</p>}
                  </div>
                )}
              </Section>

              {/* 2 · Basics */}
              <Section step={2} title="Basics" desc="What is it, who's it for, and what's it worth?" done={basicsDone} id="s-basics">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Title" icon={<Tag className="h-4 w-4" />} hint="A few words swappers will search for.">
                    <input name="title" required maxLength={120} value={fields.title} onChange={setField("title")} placeholder="Beige cargo shorts" className={fieldInput} />
                  </FormField>
                  <FormField label="Brand" icon={<Shirt className="h-4 w-4" />}>
                    <input name="brand" required maxLength={60} value={fields.brand} onChange={setField("brand")} placeholder="Uniqlo" className={fieldInput} />
                  </FormField>
                  <FormField label="Category">
                    <select name="category" required value={fields.category} onChange={setField("category")} className={fieldInput}>
                      <option value="" disabled>Select</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Size">
                    <select name="size" required value={fields.size} onChange={setField("size")} className={fieldInput}>
                      <option value="" disabled>Select</option>
                      {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Condition">
                    <select name="condition" required value={fields.condition} onChange={setField("condition")} className={fieldInput}>
                      <option value="" disabled>Select</option>
                      {conditions.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </FormField>
                  <FormField label="For">
                    <select name="gender" defaultValue="Unisex" className={fieldInput}>
                      {genders.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Color" icon={<Palette className="h-4 w-4" />}>
                    <input name="color" required maxLength={40} value={fields.color} onChange={setField("color")} placeholder="Beige" className={fieldInput} />
                  </FormField>
                  <FormField label="Swap value (credits)" icon={<Coins className="h-4 w-4" />} hint="What do you want in return?">
                    <input name="value" type="number" min={1} max={10000} required placeholder="25" className={fieldInput} />
                  </FormField>
                  <FormField label="Retail value ($)" icon={<BadgeDollarSign className="h-4 w-4" />}>
                    <input name="retailValue" type="number" min={0} max={10000} placeholder="49" className={fieldInput} />
                  </FormField>
                  <FormField label="Location" icon={<MapPin className="h-4 w-4" />}>
                    <input name="location" maxLength={120} placeholder="Brooklyn, NY" className={fieldInput} />
                  </FormField>

                  <label className="group flex cursor-pointer items-center gap-3 rounded-2xl border border-emerald-300/40 bg-emerald-50/60 p-3.5 transition-all duration-200 has-[:checked]:border-emerald-500 has-[:checked]:bg-emerald-50 sm:col-span-2">
                    <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-md border border-emerald-600/30 bg-background transition-all duration-200 has-[:checked]:border-emerald-600 has-[:checked]:bg-emerald-600">
                      <input
                        id="meetup"
                        name="meetup"
                        type="checkbox"
                        checked={meetup}
                        onChange={(e) => setMeetup(e.target.checked)}
                        className="peer absolute inset-0 cursor-pointer opacity-0"
                      />
                      <Check className="h-3.5 w-3.5 text-white opacity-0 transition-opacity peer-checked:opacity-100" />
                    </span>
                    <span className="text-sm">
                      <span className="block font-bold text-emerald-900">Open to local meetup</span>
                      <span className="text-xs text-emerald-700/70">Skip the postage — swap in person nearby.</span>
                    </span>
                  </label>

                  <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                    <FormField label="Latitude" icon={<LocateFixed className="h-4 w-4" />} hint="Optional">
                      <input name="lat" type="number" step="any" min={-90} max={90} placeholder="40.7128" value={coords.lat} onChange={(e) => setCoords((c) => ({ ...c, lat: e.target.value }))} className={fieldInput} />
                    </FormField>
                    <FormField label="Longitude" icon={<MapPin className="h-4 w-4" />} hint="Optional">
                      <input name="lng" type="number" step="any" min={-180} max={180} placeholder="-74.0060" value={coords.lng} onChange={(e) => setCoords((c) => ({ ...c, lng: e.target.value }))} className={fieldInput} />
                    </FormField>
                    <div className="flex flex-col gap-1.5 sm:col-span-2">
                      <button
                        type="button"
                        onClick={useMyLocation}
                        disabled={locBusy}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-brand/30 bg-brand/5 px-3.5 py-2.5 text-sm font-bold text-brand transition-colors hover:bg-brand/10 disabled:opacity-60"
                      >
                        {locBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                        {locBusy ? "Getting your location…" : "Use my location"}
                      </button>
                      {locError && <p className="text-xs font-medium text-destructive">{locError}</p>}
                    </div>
                  </div>
                </div>
              </Section>

              {/* 3 · Story */}
              <Section step={3} title="Tell the story" desc="Fit, fabric, wear — anything a swapper should know." done={storyDone} id="s-story">
                <FormField label="Description" multiline>
                  <textarea
                    name="description"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={5}
                    placeholder="Fit, fabric, wear, anything a swapper should know."
                    className={cn(fieldInput, "resize-none py-0.5")}
                  />
                </FormField>
              </Section>

              {/* 4 · Product details */}
              <Section step={4} title="Product details" desc="Optional, but these help swappers find and match you." optional id="s-details">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Material">
                    <select name="material" defaultValue="" className={fieldInput}>
                      <option value="">Not specified</option>
                      {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Fit">
                    <select name="fit" defaultValue="" className={fieldInput}>
                      <option value="">Not specified</option>
                      {FITS.map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Style">
                    <select name="style" defaultValue="" className={fieldInput}>
                      <option value="">Not specified</option>
                      {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Pattern">
                    <select name="pattern" defaultValue="" className={fieldInput}>
                      <option value="">Not specified</option>
                      {patterns.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Season">
                    <select name="season" defaultValue="All season" className={fieldInput}>
                      {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Quantity">
                    <input name="quantity" type="number" min={1} max={50} defaultValue={1} className={fieldInput} />
                  </FormField>
                </div>
              </Section>

              {/* 5 · Measurements */}
              <Section step={5} title="Measurements" desc="Measured flat — helps swappers nail the fit before they ask." optional id="s-measurements">
                <MeasurementsSection category={fields.category} measures={measures} onMeasure={setMeasure} />
              </Section>

              {/* 6 · Care, shipping & swap */}
              <Section step={6} title="Care, shipping & swap" desc="Set expectations up front so swaps go smoothly." optional id="s-care">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Care instructions">
                    <input name="care" maxLength={200} placeholder="Machine wash cold, line dry" className={fieldInput} />
                  </FormField>
                  <FormField label="Estimated delivery">
                    <input name="shippingDays" maxLength={40} placeholder="2–4 days" className={fieldInput} />
                  </FormField>
                  <FormField label="Tags (comma separated)">
                    <input name="tags" maxLength={120} placeholder="vintage, denim, summer" className={fieldInput} />
                  </FormField>
                  <FormField label="What you'd swap for">
                    <input name="swapPreferences" maxLength={200} placeholder="Denim jacket or knitwear in L" className={fieldInput} />
                  </FormField>
                </div>
              </Section>

              {/* 7 · Return & refund window — strengthens disputes with clear policy */}
              <Section step={7} title="Returns & scheduling" desc="Set a return window so disputes have a clear policy, and optionally schedule for later." optional id="s-returns">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Return window" hint="How long the buyer can open a dispute after delivery.">
                    <select value={String(returnWindow)} onChange={(e) => setReturnWindow(Number(e.target.value) as 0|7|14|30)} className={fieldInput}>
                      <option value="0">No returns</option>
                      <option value="7">7 days</option>
                      <option value="14">14 days (recommended)</option>
                      <option value="30">30 days</option>
                    </select>
                  </FormField>
                  <FormField label="Schedule publish (optional)" hint="Leave blank to publish now">
                    <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className={fieldInput} min={new Date().toISOString().slice(0,16)} />
                  </FormField>
                  <div className="sm:col-span-2">
                    <FormField label="Return notes (optional)" hint="e.g. Buyer pays return shipping, tags required">
                      <input value={returnPolicyText} onChange={(e) => setReturnPolicyText(e.target.value)} maxLength={300} placeholder="Tags intact, unworn — buyer covers return shipping" className={fieldInput} />
                    </FormField>
                  </div>
                </div>
                <p className="mt-3 text-xs text-foreground/50">Used by dispute resolution: “no returns” blocks post-completion disputes; other windows auto-expire. Scheduling auto-publishes at the time you set.</p>
              </Section>

              {/* 8 · Bulk import (CSV) */}
              <Section step={8} title="Bulk import (CSV)" desc="Upload many listings at once with a spreadsheet — great for clearing out your closet." optional id="s-bulk">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-dashed border-border bg-background p-4 text-center">
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      onChange={(e) => {
                        setBulkResult(null);
                        setBulkFile(e.target.files?.[0] ?? null);
                      }}
                      className="block w-full text-sm text-foreground/60 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand hover:file:bg-brand/15"
                    />
                    <p className="mt-3 text-xs text-foreground/50">
                      Use the Export CSV button on your dashboard as a template. Each row needs title, brand, description, category, size, condition, color, value and an image1 URL.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={runBulkImport}
                    disabled={!bulkFile || bulkBusy}
                    className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background transition-opacity disabled:opacity-40"
                  >
                    {bulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {bulkBusy ? "Importing…" : bulkFile ? `Import ${bulkFile.name}` : "Import CSV"}
                  </button>
                  {bulkResult && (
                    <div className="rounded-2xl border border-border bg-background p-4 text-sm">
                      <p className="font-bold">
                        {bulkResult.imported} imported{bulkResult.failed ? ` · ${bulkResult.failed} failed` : ""}
                      </p>
                      {bulkResult.errors.length > 0 && (
                        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-foreground/60">
                          {bulkResult.errors.map((e, i) => (
                            <li key={i} className="truncate">Row {e.row}: {e.reason}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              </Section>

              {error && (
                <div className="animate-fade-in flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* ── Right column: sticky live preview + tips (desktop) ── */}
            <aside className="hidden lg:block">
              <div className="sticky top-24 space-y-5">
                <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Live preview</p>
                <ListingPreview preview={livePreview} cover={previews[0]} />

                <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <h3 className="text-sm font-black">Pro tips</h3>
                  <ul className="mt-3 space-y-2.5 text-xs text-foreground/60">
                    <li className="flex gap-2"><span>📸</span> Use natural light and shoot the full garment laid flat.</li>
                    <li className="flex gap-2"><span>📏</span> Add flat measurements — fit is the #1 reason swaps happen.</li>
                    <li className="flex gap-2"><span>🎯</span> A realistic swap value gets up to 3× more offers.</li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>

          {/* Publish bar — sticky on mobile, inline on desktop: Publish / Schedule / Save draft */}
          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 py-3 backdrop-blur-md pb-[max(12px,env(safe-area-inset-bottom))] lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
            <div className="mx-auto flex w-full max-w-5xl items-center gap-3">
              {draftSavedAt && (
                <span className="hidden shrink-0 items-center gap-1.5 text-xs font-medium text-foreground/50 sm:flex">
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                  Draft saved {draftSavedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={draftSaving || submitting}
                className="hidden sm:inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-background px-5 py-3.5 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-60"
              >
                {draftSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                Save draft
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand/85 py-3.5 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/35 active:translate-y-0 disabled:opacity-60"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5" />
                )}
                {submitting ? "Uploading…" : publishAt ? `Schedule for ${new Date(publishAt).toLocaleString()}` : "Publish listing"}
              </button>
              <button
                type="button"
                onClick={onSaveDraft}
                disabled={draftSaving || submitting}
                className="sm:hidden inline-flex h-12 items-center gap-1.5 px-4 rounded-2xl border border-border bg-background text-sm font-semibold disabled:opacity-60 max-md:min-h-12"
                aria-label="Save draft"
              >
                <Tag className="h-5 w-5" /> Draft
              </button>
            </div>
            <p className="mt-2 text-center text-xs text-foreground/50">Drafts save without required fields — finish anytime from Dashboard → Drafts. Flagged items are queued for review before appearing in browse.</p>
          </div>
        </form>

        <ImageCropper
          open={cropping !== null}
          src={cropping?.src ?? ""}
          onCancel={() => setCropping(null)}
          onApply={applyCrop}
        />
      </main>
      <Footer />
    </div>
  );
}
