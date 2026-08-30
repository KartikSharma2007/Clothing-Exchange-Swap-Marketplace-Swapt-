import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Share2, MapPin, Repeat, MessageCircle, Star, BadgeCheck, Loader2, Send, Shield, Truck, Flag, CheckCircle2, Ruler, Coins, ArrowLeft, Tag, Palette, Shirt, Sparkles, PackageX, Maximize2, Bell,
} from "lucide-react";
import { SaveButton } from "@/components/site/SaveButton";
import { ReportDialog } from "@/components/site/ReportDialog";
import { ConfirmDialog } from "@/components/site/ConfirmDialog";
import { checkWatch, watchListing, unwatchListing, fetchWatch, updateWatchPrefs } from "@/lib/watch-api";
import { Navbar } from "@/components/site/Navbar";
import { Footer } from "@/components/site/Footer";
import { Avatar } from "@/components/site/Avatar";
import { ProposeSwapDialog } from "@/components/site/ProposeSwapDialog";
import { ShareMenu } from "@/components/site/ShareMenu";
import Lightbox from "@/components/site/Lightbox";
import { emptySearch } from "@/lib/taxonomy";
import { recordRecentlyViewed } from "@/lib/recently-viewed";
import { fetchListing, recordView, type ApiListing, type FitDetail } from "@/lib/listings-api";
import { fetchSellerProfile } from "@/lib/users-api";
import {
  fetchListingReviews,
  fetchCanReview,
  createReview,
  updateReview,
  deleteReview,
  type Review,
} from "@/lib/reviews-api";
import { useAuth } from "@/lib/auth-context";
import { apiEnabled } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/listing/$id")({
  loader: async ({ params }) => {
    const result = await fetchListing(params.id);
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Listing not found — Swapt" }, { name: "robots", content: "noindex" }] };
    }
    const l = loaderData.listing;
    const title = `${l.title} — ${l.brand} · Swapt`;
    const desc = `${l.condition} ${l.category.toLowerCase()} in size ${l.size}. Swap value ${l.value} credits.`;
    const envBase = (import.meta.env.VITE_SITE_URL as string | undefined) ?? "";
    const siteBase = envBase || (typeof window !== "undefined" ? window.location.origin : "");
    const canonical = siteBase ? `${siteBase.replace(/\/$/, "")}/listing/${l.id}` : `/listing/${l.id}`;
    const image = l.images[0] ?? "";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:site_name", content: "Swapt" },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "product" },
        { property: "og:image", content: image },
        { property: "og:image:alt", content: l.title },
        { property: "og:url", content: canonical },
        { property: "og:locale", content: "en_US" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        { name: "twitter:image", content: image },
      ],
    };
  },
  component: ListingDetail,
});

/**
 * OpenStreetMap embed for a listing's meetup location. Returns null when the
 * seller didn't share coordinates. Centres the marker on (lat, lng).
 */
function meetupMapEmbed(l: ApiListing): string | null {
  if (l.lat == null || l.lng == null) return null;
  const dLat = 0.006;
  const dLng = 0.012;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${l.lng - dLng}%2C${l.lat - dLat}%2C${l.lng + dLng}%2C${l.lat + dLat}&layer=mapnik&marker=${l.lat}%2C${l.lng}`;
}

function ListingDetail() {
  const { listing, related } = Route.useLoaderData();
  const { t, n, money } = useI18n();
  const [active, setActive] = useState(0);
  const [proposing, setProposing] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const meetupMap = meetupMapEmbed(listing);
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; didSwipe.current = false; };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    if (touchStartX.current != null && Math.abs(touchStartX.current - touchEndX.current) > 10) {
      if (e.cancelable) e.preventDefault();
      didSwipe.current = true;
    }
  };
  const handleTouchEnd = () => {
    if (touchStartX.current == null || touchEndX.current == null) return;
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 50) {
      didSwipe.current = true;
      if (delta > 0 && active < listing.images.length - 1) setActive((a) => a + 1);
      else if (delta < 0 && active > 0) setActive((a) => a - 1);
    }
    touchStartX.current = null;
    touchEndX.current = null;
    setTimeout(() => { didSwipe.current = false; }, 300);
  };
  const [descExpanded, setDescExpanded] = useState(false);

  const bagItem = {
    listingId: listing.id,
    title: listing.title,
    image: listing.images[0],
    owner: listing.seller?.name ?? "Swapt member",
    value: listing.value,
    category: listing.category,
    brand: listing.brand,
    size: listing.size,
  };

  // Real seller profile (location + their other listings) from the API.
  const sellerProfile = useQuery({
    queryKey: ["seller-profile", listing.seller.username],
    queryFn: () => fetchSellerProfile(listing.seller.username),
    enabled: apiEnabled && Boolean(listing.seller.username),
  });
  const sellerUser = sellerProfile.data?.user;
  const sellerListings = sellerProfile.data?.listings ?? [];
  const moreFromSeller = sellerListings.filter((l) => l.id !== listing.id).slice(0, 4);

  const qc = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const [watching, setWatching] = useState(false);
  const [watchBusy, setWatchBusy] = useState(false);
  const [watchPrefs, setWatchPrefs] = useState({ priceDrop: true, restock: true });
  useEffect(() => {
    if (!isAuthenticated || !apiEnabled) return;
    void fetchWatch(listing.id).then((res) => {
      if (res) {
        setWatching(res.watching);
        if (res.watch) setWatchPrefs({ priceDrop: res.watch.notifyPriceDrop !== false, restock: res.watch.notifyRestock !== false });
      }
    }).catch(() => void checkWatch(listing.id).then(setWatching).catch(()=>{}));
  }, [listing.id, isAuthenticated]);
  const toggleWatch = async () => {
    if (!isAuthenticated) {
      window.location.href = "/login";
      return;
    }
    setWatchBusy(true);
    try {
      if (watching) {
        await unwatchListing(listing.id);
        setWatching(false);
        const { toast } = await import("sonner");
        toast.success("No longer watching — you won't be notified of price drops.");
      } else {
        await watchListing(listing.id);
        setWatching(true);
        setWatchPrefs({ priceDrop: true, restock: true });
        const { toast } = await import("sonner");
        toast.success("Watching! We'll alert you if the price drops or it's restocked.");
      }
    } catch (err) {
      const { toast } = await import("sonner");
      toast.error(err instanceof Error ? err.message : "Couldn't update watch.");
    } finally {
      setWatchBusy(false);
    }
  };
  const togglePref = async (key: "priceDrop" | "restock") => {
    const next = { ...watchPrefs, [key]: !watchPrefs[key] };
    setWatchPrefs(next);
    try {
      await updateWatchPrefs(listing.id, { notifyPriceDrop: next.priceDrop, notifyRestock: next.restock });
      const { toast } = await import("sonner");
      toast.success(`${key === "priceDrop" ? "Price-drop" : "Restock"} alerts ${next[key] ? "on" : "off"}`);
    } catch {
      setWatchPrefs(watchPrefs);
    }
  };

  // Count the view once per browser session — reloads and re-navigations don't inflate it.
  useEffect(() => {
    if (!apiEnabled) return;
    const key = `swapt.viewed.${listing.id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    void recordView(listing.id);
  }, [listing.id]);

  // Feed the "Recently viewed" row on the home page.
  useEffect(() => {
    recordRecentlyViewed(listing);
  }, [listing]);

  const reviews = useQuery({
    queryKey: ["reviews", listing.id],
    queryFn: () => fetchListingReviews(listing.id),
    enabled: apiEnabled,
  });

  const canReview = useQuery({
    queryKey: ["can-review", listing.id],
    queryFn: () => fetchCanReview(listing.id),
    enabled: apiEnabled && isAuthenticated,
  });
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);

  /** Swapped/hidden listings are no longer available to request. */
  const unavailable = listing.status === "swapped" || listing.status === "hidden";

  const submitReview = async () => {
    if (!reviewRating || submittingReview) return;
    setSubmittingReview(true);
    setReviewError(null);
    try {
      const review = await createReview(listing.id, { rating: reviewRating, comment: reviewComment.trim() });
      setReviewRating(0);
      setReviewComment("");
      // Hide the form immediately — no waiting on a refetch race. The backend
      // already knows we reviewed; reflect that here so the "done" state shows
      // the instant the request returns.
      qc.setQueryData(["can-review", listing.id], { canReview: false, reason: "done" });
      qc.setQueryData<{ items: Review[] }>(["reviews", listing.id], (old) =>
        old ? { ...old, items: [review, ...(old.items ?? [])] } : old,
      );
      await qc.invalidateQueries({ queryKey: ["reviews", listing.id] });
      await qc.invalidateQueries({ queryKey: ["can-review", listing.id] });
      if (listing.seller.username) {
        await qc.invalidateQueries({ queryKey: ["seller-profile", listing.seller.username] });
      }
    } catch (err) {
      setReviewError(err instanceof Error ? err.message : "Could not submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const myReview = reviews.data?.items.find((r) => r.author.username === user?.username);

  const saveReviewEdit = async (review: Review, rating: number, comment: string) => {
    await updateReview(review.id, { rating, comment });
    await qc.invalidateQueries({ queryKey: ["reviews", listing.id] });
    await qc.invalidateQueries({ queryKey: ["can-review", listing.id] });
    if (listing.seller.username) {
      await qc.invalidateQueries({ queryKey: ["seller-profile", listing.seller.username] });
    }
  };

  const removeReview = async (review: Review) => {
    await deleteReview(review.id);
    await qc.invalidateQueries({ queryKey: ["reviews", listing.id] });
    await qc.invalidateQueries({ queryKey: ["can-review", listing.id] });
    if (listing.seller.username) {
      await qc.invalidateQueries({ queryKey: ["seller-profile", listing.seller.username] });
    }
  };

  const sellerFirstName = listing.seller.name.split(" ")[0] || "this seller";

  const specTiles = [
    { icon: Shirt, label: "Size", value: t("common.size", { s: listing.size }) },
    { icon: CheckCircle2, label: "Condition", value: listing.condition },
    { icon: Tag, label: "Category", value: listing.category },
    { icon: Palette, label: "Colour", value: listing.color },
  ];

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-0 max-md:pb-32">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="relative mx-auto max-w-[1240px] px-4 py-6 md:px-8 md:py-10 max-md:px-4 max-md:py-5">
        {/* Soft brand wash behind the whole page */}
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(224,53,58,0.07),transparent_70%)]" />

        {/* Breadcrumb */}
        <div className="mb-5 flex items-center justify-between gap-3">
          <Link
            to="/browse"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2.5 text-sm min-h-11 font-bold text-foreground/75 shadow-sm transition-colors hover:border-foreground/40 hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to browse
          </Link>
          <span className="text-xs font-semibold text-foreground/50">
            {t("common.listedAgo", { n: listing.postedDaysAgo })}
            {listing.views != null ? ` · ${t("common.views", { n: n(listing.views) })}` : ""}
          </span>
        </div>

        {/* ── Hero grid: gallery + buy panel ─────────────────────────── */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-8">
          {/* GALLERY — mobile premium */}
          <div>
            <div
              className="group relative overflow-hidden rounded-3xl border border-border bg-muted/50 shadow-sm max-md:rounded-2xl max-md:shadow-[0_4px_16px_rgba(0,0,0,0.06)] max-md:touch-pan-y"
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <button
                type="button"
                onClick={() => { if (didSwipe.current) return; setLightbox(true); }}
                aria-label="Open photo viewer"
                className="block w-full cursor-zoom-in"
              >
                <img
                  src={listing.images[active]}
                  alt={listing.title}
                  className="aspect-square w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] select-none"
                  draggable={false}
                />
              </button>

              {/* Zoom hint — mobile compact */}
              <span className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full bg-black/60 px-3 py-2.5 text-sm min-h-11 font-bold text-white backdrop-blur max-md:bottom-2 max-md:left-2 max-md:gap-1 max-md:px-2.5 max-md:py-2 max-md:text-xs max-md:min-h-9">
                <Maximize2 className="h-3 w-3 max-md:h-3 max-md:w-3" /> Tap to zoom
              </span>

              {/* Condition badge — mobile compact */}
              <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-background/90 px-3 py-2.5 text-sm min-h-11 font-bold shadow-sm backdrop-blur max-md:left-2 max-md:top-2 max-md:gap-1 max-md:px-2.5 max-md:py-2 max-md:text-xs max-md:min-h-9">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 max-md:h-3 max-md:w-3" /> {listing.condition}
              </span>

              {/* Gallery actions — mobile compact */}
              <div className="absolute right-3 top-3 flex gap-2 max-md:right-2 max-md:top-2 max-md:gap-1.5">
                <SaveButton
                  item={bagItem}
                  variant="pill"
                  className="gap-2 rounded-full border-0 bg-background/95 px-4 py-2 text-xs font-bold shadow-lg shadow-black/10 ring-1 ring-border/70 backdrop-blur transition-all duration-200 hover:-translate-y-px hover:ring-border active:scale-95 max-md:px-3 max-md:py-2 max-md:text-xs max-md:min-h-9 max-md:active:scale-95"
                />
                <ShareMenu url={typeof window !== "undefined" ? window.location.href : ""} title={`${listing.title} — ${listing.brand} on Swapt`}>
                  {(openShare) => (
                    <button
                      onClick={openShare}
                      aria-label="Share"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border-0 bg-background/95 px-4 py-2.5 text-sm font-bold text-foreground/90 shadow-lg shadow-black/10 ring-1 ring-border/70 backdrop-blur transition-all duration-200 hover:-translate-y-px hover:text-foreground hover:ring-border max-md:min-h-9 max-md:gap-1.5 max-md:px-3 max-md:py-2 max-md:text-xs"
                    >
                      <Share2 className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" /> Share
                    </button>
                  )}
                </ShareMenu>
              </div>

              {/* Image counter — mobile compact */}
              <span className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-2.5 text-sm min-h-11 font-bold text-white backdrop-blur max-md:bottom-2 max-md:right-2 max-md:px-2.5 max-md:py-2 max-md:text-xs max-md:min-h-9">
                {active + 1} / {listing.images.length}
              </span>

              {/* Mobile swipe dots */}
              {listing.images.length > 1 && (
                <div className="pointer-events-none absolute bottom-12 left-1/2 hidden -translate-x-1/2 items-center gap-1.5 max-md:flex">
                  {listing.images.map((_image: unknown, i: number) => (
                    <span key={i} className={cn("h-1.5 w-1.5 rounded-full transition-all duration-300", i === active ? "w-5 bg-white shadow" : "bg-white/60")} />
                  ))}
                </div>
              )}
              {/* Mobile swipe arrows — 44px hit, higher contrast */}
              {listing.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => setActive((a) => Math.max(0, a - 1))}
                    disabled={active === 0}
                    aria-label="Previous image"
                    className="absolute left-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition active:bg-black/80 disabled:opacity-30 max-md:grid"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActive((a) => Math.min(listing.images.length - 1, a + 1))}
                    disabled={active === listing.images.length - 1}
                    aria-label="Next image"
                    className="absolute right-2 top-1/2 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 text-white shadow-lg backdrop-blur transition active:bg-black/80 disabled:opacity-30 max-md:grid"
                  >
                    <ArrowLeft className="h-5 w-5 rotate-180" />
                  </button>
                </>
              )}

              {unavailable && (
                <div className="absolute inset-0 grid place-items-center bg-foreground/45 backdrop-blur-[2px]">
                  <span className="flex items-center gap-2 rounded-full bg-background px-5 py-2.5 text-sm font-black uppercase tracking-widest text-foreground shadow-xl">
                    <PackageX className="h-4 w-4 text-rose-500" /> Out of stock
                  </span>
                </div>
              )}
            </div>

            {/* Thumbnails — mobile horizontal scroll */}
            {listing.images.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2 md:grid-cols-5 max-md:flex max-md:gap-2.5 max-md:overflow-x-auto max-md:scroll-px-4 max-md:snap-x max-md:snap-mandatory max-md:scrollbar-none max-md:pb-1 max-md:-mx-4 max-md:px-4">
                {listing.images.map((src: string, i: number) => (
                  <button
                    key={i}
                    onClick={() => setActive(i)}
                    aria-label={`View image ${i + 1}`}
                    className={cn(
                      "aspect-square overflow-hidden rounded-xl border-2 transition-all duration-200 max-md:h-16 max-md:w-16 max-md:shrink-0 max-md:snap-start",
                      active === i
                        ? "border-brand shadow-md shadow-brand/20"
                        : "border-transparent opacity-70 hover:opacity-100",
                    )}
                  >
                    <img src={src} alt={`View ${i + 1}`} className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* BUY / SWAP PANEL */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-6">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-brand">{listing.brand}</p>
              <h1 className="mt-1.5 text-2xl font-black tracking-tight sm:text-[26px] md:text-[28px] md:leading-tight max-md:text-xl max-md:leading-tight">{listing.title}</h1>
              {listing.moderationStatus === "flagged" && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs">
                  <p className="font-bold text-amber-800 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> Flagged — under review</p>
                  <p className="text-amber-700/80 mt-1">{listing.moderationReason || "Auto-flagged by proactive moderation. Visible to seller but hidden from browse until approved."}</p>
                </div>
              )}
              {listing.status === "draft" && (
                <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800">Draft — only you can see this. Publish from Dashboard.</div>
              )}
              {listing.status === "scheduled" && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs">
                  <p className="font-bold text-sky-800">Scheduled</p>
                  <p className="text-sky-700/70">Publishes {listing.publishAt ? new Date(listing.publishAt).toLocaleString() : "soon"} — not yet in browse.</p>
                </div>
              )}

              {/* Rating + trust row */}
              <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground/80">
                <span className="flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-bold text-amber-700">
                  <Star className="h-3.5 w-3.5 fill-current" />
                  {Number(reviews.data?.rating ?? 0).toFixed(1)}
                </span>
                {reviews.data && reviews.data.ratingCount > 0 ? (
                  <span className="font-semibold">
                    {reviews.data.ratingCount} review{reviews.data.ratingCount === 1 ? "" : "s"}
                  </span>
                ) : (
                  <span className="font-semibold">New listing</span>
                )}
                <span className="text-foreground/35">·</span>
                <span className="flex items-center gap-1">
                  <BadgeCheck className="h-4 w-4 text-sky-500" /> {listing.seller.swaps} exchanges
                </span>
              </div>

              {/* Swap value hero — mobile compact */}
              <div className="mt-5 overflow-hidden rounded-2xl border border-brand/20 bg-brand/[0.05] max-md:mt-4 max-md:rounded-2xl">
                <div className="flex items-center justify-between gap-3 p-4 max-md:p-3 max-md:gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-foreground/50 max-md:text-[10px]">Swap value</p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 max-md:gap-x-1.5">
                      <span className="flex items-center gap-1.5 text-4xl font-black tracking-tight text-foreground max-md:text-3xl max-md:gap-1">
                        {n(listing.value)}
                        <Coins className="h-6 w-6 text-brand max-md:h-5 max-md:w-5" />
                      </span>
                      <span className="text-sm font-bold text-foreground/60">{t("common.credits")}</span>
                      {listing.retailValue ? (
                        <span className="text-sm font-semibold text-foreground/40 line-through">{money(listing.retailValue)} {t("common.retail")}</span>
                      ) : null}
                    </p>
                  </div>
                  <span className="hidden h-14 w-14 shrink-0 place-items-center rounded-2xl bg-brand/15 text-brand sm:grid">
                    <Repeat className="h-11 w-11" />
                  </span>
                </div>
                <p className="border-t border-brand/15 bg-brand/[0.04] px-4 py-2.5 text-xs font-medium text-foreground/60">
                  Or swap it for something you love — no cash needed.
                </p>
              </div>

              {/* Watch — mobile compact */}
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50/60 p-3 max-md:mt-3 max-md:rounded-2xl max-md:p-3">
                <div className="flex items-center gap-3 max-md:gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white max-md:h-8 max-md:w-8 max-md:rounded-xl"><Bell className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" /></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold leading-none max-md:text-xs">Watch this item</p>
                    <p className="text-xs text-foreground/60 mt-1 max-md:text-[11px] max-md:leading-tight">Alert if price drops or it’s back in stock.</p>
                  </div>
                  <button
                    onClick={toggleWatch}
                    disabled={watchBusy}
                    className={cn("shrink-0 rounded-full px-4 py-2.5 text-sm font-bold transition min-h-11 max-md:px-3 max-md:py-2 max-md:text-xs max-md:min-h-9", watching ? "bg-violet-600 text-white shadow" : "border border-violet-300 bg-white text-violet-700 hover:bg-violet-50")}
                  >
                    {watchBusy ? <Loader2 className="h-3 w-3 animate-spin inline" /> : watching ? "Watching ✓" : "Watch"}
                  </button>
                </div>
                {watching && (
                  <div className="mt-3 flex gap-2 text-xs">
                    <label className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 font-semibold cursor-pointer">
                      <input type="checkbox" checked={watchPrefs.priceDrop} onChange={() => void togglePref("priceDrop")} className="accent-violet-600" /> Price drop
                    </label>
                    <label className="flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-3 py-1.5 font-semibold cursor-pointer">
                      <input type="checkbox" checked={watchPrefs.restock} onChange={() => void togglePref("restock")} className="accent-violet-600" /> Back in stock
                    </label>
                  </div>
                )}
                {!watching && <p className="mt-2 text-xs text-foreground/50">Works on this exact listing — separate from saved-search alerts.</p>}
              </div>

              {/* Spec tiles — mobile compact */}
              <dl className="mt-4 grid grid-cols-2 gap-2.5 max-md:mt-3 max-md:gap-2">
                {specTiles.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="rounded-xl bg-muted/70 px-3 py-2.5 max-md:rounded-xl max-md:px-2.5 max-md:py-2">
                    <dt className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-foreground/45 max-md:text-[10px]">
                      <Icon className="h-3 w-3" /> {label}
                    </dt>
                    <dd className="mt-0.5 text-sm font-bold leading-tight break-words max-md:text-xs">{value}</dd>
                  </div>
                ))}
              </dl>

              {/* Fit widget — mobile compact */}
              {listing.fitDetails?.matches?.length ? (
                <div className={cn(
                  "mt-4 rounded-2xl border p-4 max-md:mt-3 max-md:p-3 max-md:rounded-2xl",
                  listing.likelyFit ? "border-emerald-200 bg-emerald-50/60" : "border-amber-200 bg-amber-50/60",
                )}>
                  <p className={cn("flex items-center gap-2 text-sm font-bold max-md:text-xs", listing.likelyFit ? "text-emerald-800" : "text-amber-800")}>
                    {listing.likelyFit ? <CheckCircle2 className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" /> : <Ruler className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />}
                    {listing.likelyFit
                      ? `Likely fits you${listing.fitDetails.confidence ? ` · ${listing.fitDetails.confidence} confidence` : ""}`
                      : "Probably won't fit you"}
                  </p>
                  <ul className="mt-2 space-y-1 max-md:space-y-1">
                    {listing.fitDetails.matches.map((m: FitDetail) => (
                      <li key={m.dimension} className="flex items-start gap-1.5 text-xs text-foreground/75 max-md:text-[11px] max-md:leading-tight">
                        <span className={m.ok ? "text-emerald-600" : "text-amber-600"}>{m.ok ? "✓" : "·"}</span>
                        {m.note}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-foreground/55 max-md:text-[11px]">Based on the measurements you saved in Settings → Fit &amp; size.</p>
                </div>
              ) : null}

              {/* Location + meetup — mobile compact */}
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-foreground/70 max-md:mt-3 max-md:gap-x-3 max-md:gap-y-1 max-md:text-xs">
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-4 w-4" /> {listing.location || "Ships from seller"}
                </span>
                {listing.meetup && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600/10 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                    <MapPin className="h-3 w-3" /> Local meetup available
                  </span>
                )}
              </div>

              {/* Actions — mobile compact */}
              <div className="mt-5 flex flex-col gap-2.5 max-md:mt-4 max-md:gap-2">
                {unavailable ? (
                  <div className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/50 py-3.5 text-sm font-bold text-foreground/55 max-md:py-3.5 max-md:min-h-12 max-md:text-xs">
                    <PackageX className="h-4 w-4" /> This item has been swapped
                  </div>
                ) : (
                  <button
                    onClick={() => setProposing(true)}
                    className="group flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand/85 py-3.5 text-sm font-bold text-brand-foreground shadow-lg shadow-brand/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand/35 active:translate-y-0 max-md:min-h-12 max-md:py-3.5 max-md:text-[15px] max-md:font-black"
                  >
                    <Repeat className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                    {t("action.requestExchange")} · {n(listing.value)} {t("common.creditsShort")}
                  </button>
                )}
                <div className="flex gap-2.5 max-md:gap-2.5">
                  <SaveButton item={bagItem} variant="pill" className="flex-1 justify-center max-md:min-h-12 max-md:text-sm max-md:font-bold" />
                  <ShareMenu url={typeof window !== "undefined" ? window.location.href : ""} title={`${listing.title} — ${listing.brand} on Swapt`}>
                    {(openShare) => (
                      <button
                        onClick={openShare}
                        aria-label="Share"
                        className="inline-flex flex-1 min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-colors hover:border-foreground hover:bg-muted max-md:min-h-12 max-md:px-4 max-md:py-3 max-md:text-sm max-md:font-bold"
                      >
                        <Share2 className="h-4 w-4 max-md:h-4 max-md:w-4" /> Share
                      </button>
                    )}
                  </ShareMenu>
                </div>
              </div>
            </div>

            {/* Trust badges — mobile compact */}
            <div className="mt-4 grid grid-cols-3 gap-2.5 max-md:mt-3 max-md:gap-2">
              {[
                { icon: Shield, label: "Swap protection" },
                { icon: Truck, label: "Tracked returns" },
                { icon: BadgeCheck, label: "Verified sellers" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-2 py-2.5 text-center text-xs font-bold text-foreground/60">
                  <Icon className="h-3.5 w-3.5 text-brand" /> <span className="leading-tight">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── DESCRIPTION — mobile premium */}
        <section className="mt-10 max-md:mt-8">
          <div className="max-w-3xl">
            <h2 className="flex items-center gap-2 text-lg font-black tracking-tight max-md:text-base">
              <span className="h-5 w-1 rounded-full bg-brand max-md:h-4" /> Description
            </h2>
            <p className={`mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground/80 max-md:text-sm max-md:leading-relaxed ${!descExpanded ? "max-md:line-clamp-4" : ""}`}>{listing.description}</p>
            <button type="button" onClick={() => setDescExpanded(!descExpanded)} className="mt-2 hidden text-xs font-bold text-brand hover:underline max-md:inline-flex">
              {descExpanded ? "Show less" : "Show more"}
            </button>
            {listing.tags && listing.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {listing.tags.map((t: string) => (
                  <Link
                    key={t}
                    to="/browse"
                    search={{ ...emptySearch, q: t }}
                    className="rounded-full border border-border bg-card px-3 py-2 text-sm min-h-9 font-semibold text-foreground/75 transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    #{t}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── ITEM DETAILS — PC unchanged, mobile premium 2-col card */}
        <section className="mt-10 max-md:mt-8">
          <h2 className="flex items-center gap-2 text-lg font-black tracking-tight max-md:text-base">
            <span className="h-5 w-1 rounded-full bg-brand max-md:h-4" /> Item details
          </h2>
          {/* PC — original 1-2-4 grid, hidden on mobile */}
          <dl className="mt-4 hidden grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:grid lg:grid-cols-4">
            <Spec label="Brand" value={listing.brand} />
            <Spec label="Category" value={listing.category} />
            <Spec label="Department" value={listing.gender} />
            <Spec label="Size" value={listing.size} />
            <Spec label="Condition" value={listing.condition} />
            <Spec label="Colour" value={listing.color} />
            {listing.material && <Spec label="Material" value={listing.material} />}
            {listing.fit && <Spec label="Fit" value={listing.fit} />}
            {listing.style && <Spec label="Style" value={listing.style} />}
            {listing.pattern && <Spec label="Pattern" value={listing.pattern} />}
            {listing.season && <Spec label="Season" value={listing.season} />}
            {listing.retailValue != null && <Spec label="Retail value" value={money(listing.retailValue)} />}
            <Spec label="Quantity" value={String(listing.quantity ?? 1)} />
            <Spec label="Posted" value={t("common.listedAgo", { n: listing.postedDaysAgo })} />
          </dl>
          {/* Mobile — premium 2-col card, half the height, more attractive */}
          <div className="mt-3 hidden max-md:block rounded-2xl border border-border bg-card p-3 shadow-sm">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <Spec label="Brand" value={listing.brand} />
              <Spec label="Category" value={listing.category} />
              <Spec label="Department" value={listing.gender} />
              <Spec label="Size" value={listing.size} />
              <Spec label="Condition" value={listing.condition} />
              <Spec label="Colour" value={listing.color} />
              {listing.material && <Spec label="Material" value={listing.material} />}
              {listing.fit && <Spec label="Fit" value={listing.fit} />}
              {listing.style && <Spec label="Style" value={listing.style} />}
              {listing.pattern && <Spec label="Pattern" value={listing.pattern} />}
              {listing.season && <Spec label="Season" value={listing.season} />}
              {listing.retailValue != null && <Spec label="Retail value" value={money(listing.retailValue)} />}
              <Spec label="Quantity" value={String(listing.quantity ?? 1)} />
              <Spec label="Posted" value={t("common.listedAgo", { n: listing.postedDaysAgo })} />
            </dl>
          </div>
        </section>

        {listing.measurements && Object.values(listing.measurements).some(Boolean) && (
          <section className="mt-10 max-md:mt-8">
            <h2 className="flex items-center gap-2 text-lg font-black tracking-tight max-md:text-base">
              <span className="h-5 w-1 rounded-full bg-brand max-md:h-4" /> Measurements
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4 max-md:mt-3 max-md:gap-2 max-md:text-xs">
              {Object.entries(listing.measurements).map(([k, v]) =>
                v ? <Spec key={k} label={k} value={String(v)} /> : null,
              )}
            </dl>
            <p className="mt-2 text-xs text-foreground/55">Measured flat by the seller — allow 1–2 cm tolerance.</p>
          </section>
        )}

        {/* ── CARE & SHIPPING — mobile premium */}
        <div className="mt-10 grid gap-4 sm:grid-cols-2 max-md:mt-8 max-md:gap-3">
          {listing.care && (
            <section className="rounded-3xl border border-border bg-card p-5 shadow-sm max-md:rounded-2xl max-md:p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground/60 max-md:text-xs">
                <Sparkles className="h-4 w-4 text-brand" /> Care instructions
              </h2>
              <p className="text-sm text-foreground/80 max-md:text-xs max-md:leading-relaxed">{listing.care}</p>
            </section>
          )}
          <section className="rounded-3xl border border-border bg-card p-5 shadow-sm max-md:rounded-2xl max-md:p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground/60 max-md:text-xs">
              <Truck className="h-4 w-4 text-brand" /> Shipping & swap
            </h2>
            <ul className="space-y-1.5 text-sm text-foreground/80">
              <li className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-foreground/45" /> Ships from {listing.shipsFrom ?? listing.location}</li>
              <li className="flex items-center gap-2"><Truck className="h-3.5 w-3.5 text-foreground/45" /> Estimated delivery {listing.shippingDays ?? "3–5 days"}</li>
              <li className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-emerald-600" /> Swap protection and tracked returns included</li>
              <li className="flex items-center gap-2"><Shield className="h-3.5 w-3.5 text-amber-600" /> Returns: {listing.returnWindowDays === 0 ? "No returns" : `${listing.returnWindowDays} days`}{listing.returnPolicy ? ` · ${listing.returnPolicy}` : ""}</li>
            </ul>
            {listing.swapPreferences && (
              <p className="mt-3 rounded-xl bg-muted/60 px-3 py-2 text-sm text-foreground/70">
                <span className="font-semibold">Seller wants:</span> {listing.swapPreferences}
              </p>
            )}
          </section>
        </div>

        {/* ── LOCAL MEETUP — mobile premium */}
        {listing.meetup && (
          <section className="mt-10 overflow-hidden rounded-3xl border border-border bg-card shadow-sm max-md:mt-8 max-md:rounded-2xl">
            <div className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between max-md:p-4 max-md:gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-black tracking-tight max-md:text-base">
                  <MapPin className="h-5 w-5 text-emerald-600 max-md:h-4 max-md:w-4" /> Local meetup
                </h2>
                <p className="mt-1 text-sm text-foreground/60">
                  {sellerFirstName} is happy to hand this over in person — no shipping needed.
                  {listing.location ? ` Near ${listing.location}.` : ""}
                </p>
              </div>
              {!meetupMap && (
                <p className="text-sm font-semibold text-foreground/70">
                  Request this item and agree on a public spot in the chat — the seller isn't shipping.
                </p>
              )}
            </div>

            {meetupMap ? (
              <div className="border-t border-border">
                <iframe
                  title={`Meetup map near ${listing.location || "the seller"}`}
                  src={meetupMap}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-64 w-full"
                />
                <div className="flex flex-wrap items-center gap-3 border-t border-border p-4">
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${listing.lat},${listing.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm min-h-11 font-bold text-white transition-transform hover:scale-[1.01]"
                  >
                    <MapPin className="h-3.5 w-3.5" /> Get directions
                  </a>
                  <span className="text-xs font-semibold text-foreground/55">
                    Request this item and suggest a meetup spot in the chat.
                  </span>
                </div>
              </div>
            ) : null}
          </section>
        )}

        {/* ── SELLER — mobile premium */}
        <section className="relative mt-10 overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-sm max-md:mt-8 max-md:rounded-2xl max-md:p-4">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between max-md:gap-4">
            <div className="flex items-center gap-4 max-md:gap-3">
              <div className="relative shrink-0">
                <Avatar url={listing.seller.avatarUrl || sellerUser?.avatarUrl} name={listing.seller.name} size={72} className="ring-4 ring-white shadow-md max-md:ring-2" />
                <span className="absolute -bottom-0.5 -right-0.5 grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-emerald-500 text-white max-md:h-5 max-md:w-5">
                  <BadgeCheck className="h-3.5 w-3.5 max-md:h-3 max-md:w-3" aria-label="Verified member" />
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 max-md:gap-x-1.5">
                  <h2 className="truncate text-lg font-black tracking-tight text-foreground max-md:text-base">{listing.seller.name}</h2>
                  {sellerUser?.phoneVerified && <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" aria-label="Phone verified member" />}
                </div>
                <Link
                  to="/seller/$username"
                  params={{ username: listing.seller.username }}
                  className="-mt-0.5 inline-block text-sm font-semibold text-brand transition-colors hover:underline"
                >
                  @{listing.seller.username}
                </Link>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 font-bold text-amber-600">
                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> {Number(listing.seller.rating || 0).toFixed(1)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground/70">
                    <Repeat className="h-3 w-3" /> {listing.seller.swaps} exchanges
                  </span>
                  {listing.seller.reliability != null && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 font-bold text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" /> {listing.seller.reliability}% completion
                    </span>
                  )}
                  {sellerUser?.location && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 font-semibold text-foreground/70">
                      <MapPin className="h-3 w-3" /> {sellerUser.location}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {listing.seller.username ? (
                <Link
                  to="/seller/$username"
                  params={{ username: listing.seller.username }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 hover:border-foreground hover:bg-muted"
                >
                  View profile <ArrowLeft className="h-3.5 w-3.5 rotate-180" />
                </Link>
              ) : (
                <button disabled className="rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold opacity-60">View profile</button>
              )}
              <button
                onClick={() => setProposing(true)}
                disabled={unavailable}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-bold transition-colors hover:bg-muted disabled:opacity-50"
              >
                <MessageCircle className="h-4 w-4" /> Message
              </button>
              <button
                onClick={() => setReportOpen(true)}
                aria-label="Report this listing"
                title="Report this listing"
                className="grid h-10 w-10 place-items-center rounded-xl border border-border text-foreground/50 transition-colors hover:bg-muted hover:text-rose-600"
              >
                <Flag className="h-4 w-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ── MORE FROM THIS USER ── */}
        {moreFromSeller.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-4 text-lg font-black tracking-tight">More from {sellerFirstName}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
              {moreFromSeller.map((l) => (
                <Link key={l.id} to="/listing/$id" params={{ id: l.id }} className="group block">
                  <div className="product-card aspect-square overflow-hidden rounded-2xl">
                    <img src={l.images[0]} alt={l.title} loading="lazy" className="product-card-img group-hover:scale-[1.04]" />
                    <span className="absolute left-2 bottom-2 rounded-md bg-background/90 px-2 py-0.5 text-xs font-bold">{l.value} cr</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold">{l.title}</p>
                  <p className="text-xs text-foreground/60">{l.brand} · Size {l.size}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ── REVIEWS — mobile premium */}
        <section className="mt-10 max-md:mt-8">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3 max-md:gap-2">
            <h2 className="flex items-center gap-2 text-lg font-black tracking-tight max-md:text-base">
              <span className="h-5 w-1 rounded-full bg-brand max-md:h-4" /> Reviews
            </h2>
            {reviews.data && reviews.data.ratingCount > 0 && (
              <span className="flex items-center gap-1.5 text-sm text-foreground/70">
                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                <span className="font-bold text-foreground">{reviews.data.rating.toFixed(1)}</span>
                · {reviews.data.ratingCount} review{reviews.data.ratingCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* Star distribution — matches the seller-profile tab */}
          {reviews.data && reviews.data.distribution && reviews.data.ratingCount > 0 && (
            <div className="mb-6 rounded-3xl border border-border bg-card/60 p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-4">
                <span className="text-5xl font-black tracking-tight text-foreground">{reviews.data.rating.toFixed(1)}</span>
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={cn(
                          "h-4 w-4",
                          n <= Math.round(reviews.data.rating) ? "fill-amber-500 text-amber-500" : "text-foreground/20",
                        )}
                      />
                    ))}
                  </span>
                  <span className="text-xs text-foreground/50">
                    {reviews.data.ratingCount} review{reviews.data.ratingCount === 1 ? "" : "s"}
                  </span>
                </span>
              </div>
              <div className="space-y-1.5">
                {reviews.data.distribution.map((count, i) => {
                  const star = 5 - i;
                  const pct = reviews.data.ratingCount ? Math.round((count / reviews.data.ratingCount) * 100) : 0;
                  return (
                    <div key={star} className="flex items-center gap-2 text-xs">
                      <span className="flex w-8 shrink-0 items-center gap-0.5 font-semibold text-foreground/70">
                        {star}
                        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                      </span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-8 shrink-0 text-right tabular-nums text-foreground/45">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Write a review — only after a completed swap with the seller */}
          {isAuthenticated && listing.seller.username !== user?.username && !canReview.isLoading && (
            canReview.data?.canReview && !myReview ? (
            <div className="mb-6 rounded-3xl border border-border bg-card/60 p-5 shadow-sm">
              <p className="mb-3 text-sm font-bold">Leave a review for {sellerFirstName}</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setReviewRating(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    className="transition-transform hover:scale-110">
                    <Star className={cn("h-7 w-7", n <= reviewRating ? "fill-amber-500 text-amber-500" : "text-foreground/25")} />
                  </button>
                ))}
                <span className="ml-2 text-xs text-foreground/50">{reviewRating ? `${reviewRating}/5` : "Tap to rate"}</span>
              </div>
              <textarea
                value={reviewComment}
                onChange={(e) => setReviewComment(e.target.value)}
                rows={3}
                maxLength={600}
                placeholder="Share your experience — fit, quality, communication…"
                className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-brand/60"
              />
              {reviewError && <p className="mt-2 text-xs font-semibold text-rose-600">{reviewError}</p>}
              <button
                onClick={submitReview}
                disabled={!reviewRating || submittingReview}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2 text-sm font-bold text-background transition-transform hover:scale-[1.01] disabled:opacity-50"
              >
                {submittingReview ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit review
              </button>
            </div>
            ) : canReview.data?.reason === "no-swap" ? (
              <div className="mb-6 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-foreground/55">
                🔒 Reviews unlock after you complete a swap with {sellerFirstName}.
              </div>
            ) : myReview || canReview.data?.reason === "done" ? (
              <div className="mb-6 rounded-2xl border border-dashed border-border p-4 text-center text-sm text-foreground/55">
                ✓ You've already reviewed this item — thanks for your feedback!
              </div>
            ) : null
          )}

          {reviews.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-foreground/50">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
            </p>
          ) : !reviews.data || reviews.data.items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-foreground/55">
              No reviews yet. <span className="font-semibold">Be the first to swap with {sellerFirstName}</span> and leave feedback once the exchange is completed.
            </div>
          ) : (
            <div className="grid gap-4">
              {reviews.data.items.map((r) => (
                <ReviewCard
                  key={r.id}
                  review={r}
                  isMine={Boolean(myReview && myReview.id === r.id)}
                  onUpdate={saveReviewEdit}
                  onDelete={removeReview}
                />
              ))}
            </div>
          )}
        </section>

        {/* ── YOU MAY ALSO LIKE — mobile premium */}
        {related.length > 0 && (
          <section className="mt-10 max-md:mt-8">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-black tracking-tight md:text-xl max-md:text-base max-md:mb-3">
              <Sparkles className="h-5 w-5 text-brand max-md:h-4 max-md:w-4" /> You may also like
            </h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5 max-md:gap-2.5">
              {related.map((l: ApiListing) => (
                <div key={l.id} className="group relative">
                  <SaveButton
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
                    className="absolute right-2 top-2 z-10 h-8 w-8 rounded-full bg-background/80 shadow-sm backdrop-blur"
                  />
                  <Link to="/listing/$id" params={{ id: l.id }} className="block">
                    <div className="product-card aspect-square overflow-hidden rounded-2xl">
                      <img src={l.images[0]} alt={l.title} loading="lazy" className="product-card-img group-hover:scale-[1.04]" />
                      <span className="absolute left-2 bottom-2 rounded-md bg-background/90 px-2 py-0.5 text-xs font-bold">
                        {n(l.value)} {t("common.creditsShort")}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm font-semibold">{l.title}</p>
                    <p className="text-xs text-foreground/60">{l.brand} · {t("common.size", { s: l.size })}</p>
                  </Link>
                  {l.matchLabel && (
                    <span className="mt-1.5 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand">
                      {l.matchLabel}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Mobile sticky action bar — best premium */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl md:hidden rounded-t-[1.75rem] shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.15)] px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <div className="mx-auto max-w-[480px]">
          {/* Drag handle */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-foreground/10" />
          {/* Top row: thumb + title + save */}
          <div className="flex items-center gap-3">
            <img src={listing.images[0]} alt="" className="h-12 w-12 shrink-0 rounded-xl object-cover border border-border shadow-sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black leading-tight">{listing.title}</p>
              <p className="truncate text-xs font-semibold text-foreground/60">{listing.brand} · {listing.size} · {listing.condition}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs font-black text-brand">
                <Coins className="h-3 w-3" /> {n(listing.value)} {t("common.credits")}
              </p>
            </div>
            <SaveButton item={bagItem} className="h-12 w-12 shrink-0 rounded-xl border border-border bg-background shadow-sm" />
          </div>
          {/* Bottom row: actions */}
          <div className="mt-3 grid gap-2.5">
            {unavailable ? (
              <span className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-muted/50 px-4 text-sm font-bold text-foreground/50">
                <PackageX className="h-4 w-4" /> Out of stock
              </span>
            ) : (
              <div className="grid grid-cols-[48px_1fr] gap-2.5">
                <button
                  onClick={() => setProposing(true)}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border bg-background text-foreground shadow-sm transition-colors hover:bg-muted active:scale-95"
                  aria-label="Message"
                >
                  <MessageCircle className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setProposing(true)}
                  className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand to-brand/85 px-4 text-sm font-black text-white shadow-lg shadow-brand/25 transition-all active:scale-[0.98]"
                >
                  <Repeat className="h-4 w-4" /> {t("action.requestExchange")} · {n(listing.value)} {t("common.creditsShort")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ProposeSwapDialog
        listingId={listing.id}
        listingTitle={listing.title}
        listingValue={listing.value}
        meetupAvailable={Boolean(listing.meetup)}
        open={proposing}
        onClose={() => setProposing(false)}
      />

      {reportOpen && <ReportDialog targetType="listing" targetId={listing.id} onClose={() => setReportOpen(false)} />}

      {lightbox && (
        <Lightbox
          images={listing.images}
          index={active}
          onClose={() => setLightbox(false)}
          onIndexChange={setActive}
        />
      )}

      <Footer />

    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/60 px-3.5 py-2.5 transition-colors hover:bg-muted max-md:rounded-xl max-md:bg-muted/40 max-md:border max-md:border-border/50 max-md:px-3 max-md:py-2.5 max-md:shadow-sm">
      <dt className="text-xs font-bold uppercase tracking-wider text-foreground/45 max-md:text-[10px] max-md:tracking-widest">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold max-md:text-xs max-md:font-black">{value}</dd>
    </div>
  );
}

function ReviewCard({
  review,
  isMine = false,
  onUpdate,
  onDelete,
}: {
  review: Review;
  isMine?: boolean;
  onUpdate?: (review: Review, rating: number, comment: string) => Promise<void>;
  onDelete?: (review: Review) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editComment, setEditComment] = useState(review.comment);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const time = new Date(review.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const save = async () => {
    if (!onUpdate || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onUpdate(review, editRating, editComment.trim());
      setEditing(false);
    } catch {
      setError("Couldn't update your review.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!onDelete || busy) return;
    setBusy(true);
    try {
      await onDelete(review);
      setConfirmOpen(false);
    } catch {
      setError("Couldn't delete your review.");
      setBusy(false);
    }
  };

  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-3">
        <Avatar url={review.author.avatarUrl} name={review.author.name} size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{review.author.name}</p>
          <p className="text-xs text-foreground/50">@{review.author.username} · {time}</p>
        </div>
        {isMine && !editing && (
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-border px-2.5 py-2 text-sm min-h-9 font-semibold transition-colors hover:bg-muted"
            >
              Edit
            </button>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={busy}
              className="rounded-lg border border-rose-200 px-2.5 py-2 text-sm min-h-9 font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              {busy ? "…" : "Delete"}
            </button>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete your review?"
        description="This removes your rating and comment from this item permanently."
        confirmLabel="Delete review"
        busy={busy}
        onConfirm={() => void remove()}
        onClose={() => setConfirmOpen(false)}
      />

      {editing ? (
        <div className="mt-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setEditRating(n)} aria-label={`${n} star${n === 1 ? "" : "s"}`} className="transition-transform hover:scale-110">
                <Star className={cn("h-5 w-5", n <= editRating ? "fill-amber-500 text-amber-500" : "text-foreground/25")} />
              </button>
            ))}
          </div>
          <textarea
            value={editComment}
            onChange={(e) => setEditComment(e.target.value)}
            rows={2}
            maxLength={600}
            className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-brand/60"
          />
          {error && <p className="mt-1 text-xs font-semibold text-rose-600">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button
              onClick={save}
              disabled={busy || !editRating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-3 py-2.5 text-sm min-h-11 font-bold text-background disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setEditRating(review.rating);
                setEditComment(review.comment);
                setError(null);
              }}
              className="rounded-xl border border-border px-3 py-2.5 text-sm min-h-11 font-semibold hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className={cn("h-4 w-4", i < review.rating ? "fill-amber-500 text-amber-500" : "text-foreground/25")} />
            ))}
          </div>
          {review.comment && <p className="mt-3 text-sm leading-relaxed text-foreground/80">{review.comment}</p>}
        </>
      )}
    </div>
  );
}