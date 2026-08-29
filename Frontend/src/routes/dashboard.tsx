import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import {
  ArrowLeftRight, ArrowUpRight, BadgeCheck, Bell, Camera, Check, CheckCircle2,
  ChevronDown, ChevronRight, Circle, Clock, Download, Eye, EyeOff, Heart, Loader2, MapPin, MessageCircle,
  Package, PartyPopper, PenLine, Plus, Repeat, Ruler, Search, Settings, ShieldCheck,
  MoreHorizontal, Sparkles, Star, Trash2, TrendingUp, Truck, Upload, UserRound, Users, Wallet, X,
} from "lucide-react";
import { Footer } from "@/components/site/Footer";
import { Protected } from "@/components/site/Protected";
import { Avatar } from "@/components/site/Avatar";
import { ConfirmDialog } from "@/components/site/ConfirmDialog";
import { NotificationBell } from "@/components/site/NotificationBell";
import { AccountMenu } from "@/components/site/AccountMenu";
import { toast } from "sonner";
import { uploadAvatar, removeAvatar } from "@/lib/auth-api";
import { CreditsModal } from "@/components/site/CreditsModal";
import { ImpactCard } from "@/components/site/ImpactCard";
import { useAuth } from "@/lib/auth-context";
import { fetchFollowerUsers, fetchFollowingUsers, fetchMyListings, fetchMySwapsPage, fetchSellerAnalytics, fetchFollowingFeed, removeFollowerUser, removeFollowingUser, type MyListing, type SwapRecord } from "@/lib/dashboard-api";
import { boostListing, deleteListing, setListingVisibility, publishListing } from "@/lib/listings-api";
import { deleteConversation, startConversation } from "@/lib/swap-api";
import { fetchSwapMatches, type SwapMatch } from "@/lib/matchmaking-api";
import { apiEnabled } from "@/lib/api";
import { downloadApiCsv, toCsv } from "@/lib/csv";
import { relativeTime } from "@/lib/i18n";
import { fetchNotifications, type AppNotification } from "@/lib/notifications-api";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  validateSearch: (search: Record<string, unknown>): { welcome?: boolean } =>
    search.welcome === true || search.welcome === "true" ? { welcome: true } : {},
  head: () => ({
    meta: [
      { title: "Your dashboard — Swapt" },
      { name: "description", content: "Manage your Swapt listings, review swap history and keep your profile details up to date." },
      { property: "og:title", content: "Your Swapt dashboard" },
      { property: "og:description", content: "Listings, swap history and profile details in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Protected>
      <DashboardPage />
    </Protected>
  ),
});

type Tab = "listings" | "swaps" | "matches" | "following" | "followers";
type ListingFilter = "all" | "active" | "hidden" | "swapped" | "draft" | "scheduled" | "flagged";
type SwapFilter = "all" | "pending" | "accepted" | "completed" | "other";

const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
  { id: "listings", label: "My listings", icon: Package },
  { id: "swaps", label: "Swap history", icon: ArrowLeftRight },
  { id: "matches", label: "Suggested swaps", icon: Sparkles },
  { id: "following", label: "Following", icon: Heart },
  { id: "followers", label: "Followers", icon: Users },
];

const LISTING_FILTERS: ListingFilter[] = ["all", "active", "hidden", "swapped", "draft", "scheduled", "flagged"];
const SWAP_FILTERS: { id: SwapFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "accepted", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "other", label: "Closed" },
];

function notificationIcon(notification: AppNotification): typeof Bell {
  if (notification.kind === "message") return MessageCircle;
  if (notification.kind === "swap_request") return Bell;
  if (notification.kind === "swap_accepted") return CheckCircle2;
  if (notification.kind === "swap_match") return Sparkles;
  if (notification.kind === "watch_alert") return Eye;
  if (notification.kind === "dispute_message") return ShieldCheck;
  if (notification.kind === "sold") return Package;
  return Bell;
}

function notificationTone(notification: AppNotification): string {
  if (notification.kind === "message") return "bg-brand/10 text-brand";
  if (notification.kind === "swap_request") return "bg-amber-500/10 text-amber-600";
  if (notification.kind === "swap_accepted" || notification.kind === "sold") return "bg-emerald-500/10 text-emerald-600";
  if (notification.kind === "swap_match") return "bg-violet-500/10 text-violet-600";
  if (notification.kind === "dispute_message") return "bg-rose-500/10 text-rose-600";
  return "bg-muted text-foreground/70";
}

function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { welcome } = Route.useSearch();
  const [tab, setTab] = useState<Tab>("listings");
  const [listingFilter, setListingFilter] = useState<ListingFilter>("all");
  const [swapFilter, setSwapFilter] = useState<SwapFilter>("all");
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  // Avatar lightbox + menu
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const { refresh } = useAuth();

  const uploadMut = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: async () => {
      await refresh();
      setShowAvatarModal(false);
      toast.success("Profile photo updated");
    },
    onError: () => toast.error("Failed to upload image"),
  });

  const removeMut = useMutation({
    mutationFn: () => removeAvatar(),
    onSuccess: async () => {
      await refresh();
      setShowAvatarModal(false);
      toast.success("Profile photo removed");
    },
    onError: () => toast.error("Failed to remove photo"),
  });

  useEffect(() => {
    if (!welcome) return;
    setShowWelcome(true);
    const t = window.setTimeout(() => setShowWelcome(false), 6000);
    return () => window.clearTimeout(t);
  }, [welcome]);

  const listings = useQuery({ queryKey: ["me", "listings"], queryFn: fetchMyListings });
  const swaps = useQuery({ queryKey: ["me", "swaps"], queryFn: () => fetchMySwapsPage() });
  const matches = useQuery({ queryKey: ["me", "matches"], queryFn: fetchSwapMatches });
  const analytics = useQuery({ queryKey: ["me", "analytics"], queryFn: fetchSellerAnalytics });
  const followingFeed = useQuery({ queryKey: ["me", "following-feed"], queryFn: fetchFollowingFeed });
  const notifications = useQuery({ queryKey: ["notifications", "recent"], queryFn: () => fetchNotifications(100) });
  const followingUsers = useQuery({ queryKey: ["me", "following"], queryFn: fetchFollowingUsers });
  const followerUsers = useQuery({ queryKey: ["me", "followers"], queryFn: fetchFollowerUsers });

  // Cursor pagination — load more pages of the swap history on demand.
  const [extraSwaps, setExtraSwaps] = useState<SwapRecord[]>([]);
  const [extraCursor, setExtraCursor] = useState<string | null>(null);
  const [hasMoreExtra, setHasMoreExtra] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const allSwaps = useMemo(() => [...(swaps.data?.items ?? []), ...extraSwaps], [swaps.data?.items, extraSwaps]);
  const hasMoreSwaps = swaps.data ? swaps.data.hasMore || hasMoreExtra : false;

  // Reset pagination when the base query refetches (new swap, pull-to-refresh) — otherwise stale extra pages duplicate
  useEffect(() => {
    setExtraSwaps([]);
    setExtraCursor(null);
    setHasMoreExtra(false);
  }, [swaps.data]);

  const loadMoreSwaps = async () => {
    if (loadingMore) return;
    const cursor = extraCursor ?? swaps.data?.nextCursor ?? null;
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchMySwapsPage(cursor);
      setExtraSwaps((prev) => [...prev, ...page.items]);
      setExtraCursor(page.nextCursor);
      setHasMoreExtra(page.hasMore);
    } catch {
      /* ignore load-more errors */
    } finally {
      setLoadingMore(false);
    }
  };

  const active = listings.data?.filter((l) => l.status === "active").length ?? 0;
  const completed = allSwaps.filter((s) => s.status === "completed").length ?? 0;
  const pending = allSwaps.filter((s) => s.status === "pending").length ?? 0;
  const totalUnread = allSwaps.reduce((n, s) => n + (s.unreadCount ?? 0), 0) ?? 0;
  const firstName = (user?.displayName ?? user?.username ?? "there").split(" ")[0];

  const goTab = (t: Tab) => {
    setTab(t);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const showListings = (f: ListingFilter) => { setListingFilter(f); goTab("listings"); };

  // Avatar modal handlers
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    uploadMut.mutate(f);
  };

  const onRemove = () => {
    if (!confirm("Remove your profile photo?")) return;
    removeMut.mutate();
  };
  const showSwaps = (f: SwapFilter) => { setSwapFilter(f); goTab("swaps"); };

  const activity = useMemo(() => (notifications.data ?? []).map((notification) => ({
    id: notification.id,
    icon: notificationIcon(notification),
    tone: notificationTone(notification),
    text: notification.body || notification.title,
    at: notification.createdAt,
    read: Boolean(notification.readAt),
  })), [notifications.data]);

  const checks = useMemo(() => {
    const hasMeasurements = Boolean(user?.measurements && Object.values(user.measurements).some(Boolean));
    return [
      { label: "Add a profile photo", done: Boolean(user?.avatarUrl), icon: Camera },
      { label: "Write a short bio", done: Boolean(user?.bio?.trim()), icon: PenLine },
      { label: "Set your location", done: Boolean(user?.location?.trim()), icon: MapPin },
      { label: "Verify your phone", done: Boolean(user?.phoneVerified), icon: BadgeCheck },
      { label: "Add your measurements", done: hasMeasurements, icon: Ruler },
    ];
  }, [user]);
  const profilePercent = Math.round((checks.filter((c) => c.done).length / checks.length) * 100);

  return (
    <div className="min-h-screen bg-background">
      {/* ── Dashboard header (no site navbar) ─────────────────────── */}
      {/* Mobile: warm ivory bar with a hairline gold seam at the base — echoes the classic hero below. Desktop rules (md:) are untouched. */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur max-md:border-b-0 max-md:bg-gradient-to-b max-md:from-amber-50/70 max-md:via-background/95 max-md:to-background max-md:shadow-[0_1px_0_rgba(180,130,40,0.18)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 md:px-8 max-md:py-3.5 max-md:flex-wrap">
          <Link to="/" className="text-2xl font-black tracking-tight max-md:text-[22px]">
            swapt<span className="text-brand">.</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2 max-md:ml-auto max-md:gap-1.5">
            <button
              onClick={() => setCreditsOpen(true)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-700 transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-md max-md:border-amber-200/70 max-md:bg-gradient-to-r max-md:from-amber-50 max-md:to-white max-md:px-3.5 max-md:text-amber-800 max-md:shadow-sm max-md:active:scale-95"
              aria-label={`Open credits — balance ${user?.credits ?? 0}`}
            >
              <Wallet className="h-4 w-4 max-md:text-amber-600" />
              {user?.credits ?? 0}
              <span className="hidden text-xs font-semibold text-violet-500/80 sm:inline max-md:!hidden">credits</span>
            </button>
            {user?.username && (
              <Link
                to="/seller/$username"
                params={{ username: user.username }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand hover:shadow-md max-md:px-3.5 max-md:text-xs"
              >
                <UserRound className="h-4 w-4" />
                <span>Public profile</span>
              </Link>
            )}
            <NotificationBell />
            <AccountMenu />
          </div>
        </div>
      </header>

      {showWelcome && (
        <div className="fixed inset-x-0 top-16 z-50 flex justify-center px-4">
          <div className="flex w-full max-w-md animate-scale-in items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
              <PartyPopper className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black tracking-tight">Hello {firstName}! 🎉👋</p>
              <p className="mt-0.5 text-sm text-foreground/65">
                Your profile is all set — time to list something and start swapping ✨
              </p>
            </div>
            <button onClick={() => setShowWelcome(false)} aria-label="Dismiss" className="rounded-full p-1 text-foreground/50 hover:bg-muted hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">
        {/* ── Dashboard hero — decorative panel + avatar/greeting/actions/quote, stat strip beneath ── */}
        {/* MOBILE PHOTO HERO */}
        <section className="overflow-hidden rounded-3xl border border-border bg-[#fdfaf2] md:hidden">
          <div className="relative h-36">
            {/* Designed gradient panel — no external photo, so it always renders consistently */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,#e8c98a_0%,transparent_45%),radial-gradient(circle_at_80%_70%,#9cb89a_0%,transparent_50%),linear-gradient(160deg,#f3e6c8_0%,#e9dcc0_100%)]" />
            <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, rgba(74,63,42,0.12) 1px, transparent 0)`, backgroundSize: '14px 14px' }} />
            <div className="relative flex h-full items-end gap-3 p-4">
              <Avatar
                url={user?.avatarUrl}
                name={user?.displayName || user?.username}
                size={56}
                className="shrink-0 rounded-full ring-[3px] ring-[#fdfaf2] shadow-md"
                onClick={() => setShowAvatarModal(true)}
              />
              <div className="min-w-0 flex-1 pb-0.5">
                <p className="flex items-center gap-1 text-xs font-semibold text-foreground/65">Good to see you again <span>👋</span></p>
                <div className="mt-0.5 flex items-center gap-2">
                  <h1 className="truncate text-[18px] font-black tracking-tight text-foreground">{user?.displayName || firstName}</h1>
                  {user?.role === "admin" && (
                    <span className="shrink-0 rounded-full bg-violet-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Admin</span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs font-medium text-foreground/55">@{user?.username}</p>
              </div>
            </div>
          </div>

          {/* Stat strip on warm cream band */}
          <div className="flex divide-x divide-[#e9ddc3] border-t border-[#e9ddc3] bg-[#fdfaf2] px-2 py-3">
            {typeof user?.reliability === "number" && (
              <div className="flex flex-1 items-center justify-center gap-1.5 px-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-bold text-foreground">{user.reliability}% <span className="font-medium text-foreground/50">reliable</span></span>
              </div>
            )}
            <div className="flex flex-1 items-center justify-center gap-1.5 px-1">
              <Star className="h-3.5 w-3.5 fill-[#c9a04e] text-[#c9a04e]" />
              <span className="text-xs font-bold text-foreground">{Number(user?.rating ?? 0).toFixed(1)} <span className="font-medium text-foreground/50">({user?.ratingCount ?? 0})</span></span>
            </div>
            <div className="flex flex-1 items-center justify-center gap-1.5 px-1">
              <MapPin className="h-3.5 w-3.5 text-foreground/50" />
              <span className="truncate text-xs font-bold text-foreground/80">{user?.location?.trim() || "No location"}</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="grid gap-2 p-4">
            <Link
              to="/sell"
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-bold text-background active:scale-[0.98] transition"
            >
              <Plus className="h-4 w-4" /> List an item
            </Link>
            <Link
              to="/browse"
              className="flex min-h-[46px] items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-bold text-foreground active:scale-[0.98] transition"
            >
              <Repeat className="h-4 w-4" /> Browse swaps
            </Link>
          </div>
        </section>

        {/* DESKTOP PHOTO HERO */}
        <section className="hidden overflow-hidden rounded-3xl border border-border bg-[#fdfaf2] md:block">
          <div className="flex flex-col lg:flex-row">
            {/* Identity block now lives on the gradient panel itself, rather than beside it */}
            <div className="relative flex shrink-0 items-center gap-4 overflow-hidden p-6 lg:w-[420px] lg:p-8">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,#e8c98a_0%,transparent_45%),radial-gradient(circle_at_75%_75%,#9cb89a_0%,transparent_50%),linear-gradient(165deg,#f3e6c8_0%,#e9dcc0_100%)]" />
              <div className="absolute inset-0" style={{ backgroundImage: `radial-gradient(circle at 1px 1px, rgba(74,63,42,0.12) 1px, transparent 0)`, backgroundSize: '16px 16px' }} />
              {/* soft blend into the cream content area on the right, so the panel doesn't read as a stitched-on rectangle */}
              <div className="absolute inset-y-0 right-0 hidden w-20 bg-gradient-to-r from-transparent to-[#fdfaf2] lg:block" />

              <Avatar
                url={user?.avatarUrl}
                name={user?.displayName || user?.username}
                size={68}
                className="relative z-10 shrink-0 rounded-full ring-4 ring-[#fdfaf2] shadow-md"
                onClick={() => setShowAvatarModal(true)}
              />
              <div className="relative z-10 min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground/60">Good to see you again <span>👋</span></p>
                <div className="mt-1 flex flex-wrap items-center gap-2.5">
                  <h1 className="text-[26px] font-black tracking-tight text-foreground">{user?.displayName || firstName}</h1>
                  {user?.role === "admin" && (
                    <span className="rounded-full bg-violet-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Admin</span>
                  )}
                </div>
                <p className="mt-1 truncate text-sm font-medium text-foreground/55">
                  @{user?.username} <span className="mx-1.5 text-foreground/25">·</span> {user?.email}
                </p>
              </div>
            </div>

            <div className="flex flex-1 flex-wrap items-start justify-end gap-6 p-6 lg:p-8">
              <div className="flex flex-col items-end gap-3">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Link
                    to="/sell"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-violet-700"
                  >
                    <Plus className="h-4 w-4" /> List an item
                  </Link>
                  <Link
                    to="/browse"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted"
                  >
                    <Repeat className="h-4 w-4" /> Browse swaps
                  </Link>
                </div>
                <div className="w-full max-w-[220px] rounded-2xl border border-[#e9ddc3] bg-card p-4">
                  <span className="font-serif text-2xl leading-none text-[#c9a04e]">“</span>
                  <p className="mt-1 text-sm font-semibold leading-snug text-foreground/75">Swap more, save more, live better.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Stat strip along the bottom */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-[#e9ddc3] bg-[#fdfaf2] px-6 py-3.5 lg:px-8">
            <span className="inline-flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-foreground/40" />
              <span className="font-medium text-foreground/50">Member since</span>
              <span className="font-bold text-foreground">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "recently"}</span>
            </span>
            <span className="inline-flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-foreground/40" />
              <span className="font-medium text-foreground/50">Location</span>
              <span className="font-bold text-foreground">{user?.location?.trim() || "No location"}</span>
            </span>
            {typeof user?.reliability === "number" && (
              <span className="inline-flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
                <span className="font-medium text-foreground/50">Reliability</span>
                <span className="font-bold text-emerald-700">{user.reliability}% reliable</span>
              </span>
            )}
            <span className="inline-flex items-center gap-2 text-sm">
              <Star className="h-4 w-4 fill-[#c9a04e] text-[#c9a04e]" />
              <span className="font-medium text-foreground/50">Rating</span>
              <span className="font-bold text-foreground">{Number(user?.rating ?? 0).toFixed(1)} ({user?.ratingCount ?? 0} review{user?.ratingCount === 1 ? "" : "s"})</span>
            </span>
          </div>
        </section>

        {/* Avatar lightbox modal */}
        {showAvatarModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowAvatarModal(false)}>
            <div className="max-h-[90vh] w-full max-w-2xl p-4" onClick={(e) => e.stopPropagation()}>
              <div className="relative rounded-2xl bg-background p-4">
                <button aria-label="Close" onClick={() => setShowAvatarModal(false)} className="absolute right-3 top-3 h-9 w-9 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>

                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="Profile" className="w-full max-h-[70vh] object-contain rounded-md" />
                    ) : (
                      <div className="grid h-64 place-items-center rounded-md bg-muted text-4xl font-black text-foreground">{(user?.displayName || user?.username || "?").slice(0,2).toUpperCase()}</div>
                    )}
                  </div>

                  <div className="w-44 shrink-0">
                    <div className="flex items-center justify-end">
                      <div className="relative">
                        <button
                          className="h-9 w-9 rounded-full border border-border bg-background flex items-center justify-center hover:bg-muted"
                          onClick={() => setMenuOpen((s) => !s)}
                          aria-label="Photo menu"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>

                        {menuOpen && (
                          <div className="absolute right-0 mt-2 w-40 rounded-md border border-border bg-background p-2 shadow">
                            <button
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                              onClick={() => { setMenuOpen(false); fileRef.current?.click(); }}
                            >
                              <Camera className="h-4 w-4" /> Change photo
                            </button>
                            <button
                              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                              onClick={() => { setMenuOpen(false); onRemove(); }}
                            >
                              <Trash2 className="h-4 w-4" /> Remove photo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-2">
                      <input ref={fileRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                      <button onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-3 py-2 text-sm">Upload new</button>
                      <button onClick={() => setShowAvatarModal(false)} className="rounded-md px-3 py-2 text-sm">Close</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {!apiEnabled && (
          <p className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-surface-cream px-4 py-3 text-sm text-foreground/70">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Local mode — accounts and settings are stored in this browser. Set <code className="font-mono">VITE_API_URL</code> to use the MongoDB API.
          </p>
        )}

        {/* ── Clickable stats · static grid on mobile (no more hidden horizontal scroll) · grid on sm+ ── */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={Package} tone="bg-brand/10 text-brand" label="Active listings" value={active} sub="view your listings"
            onClick={() => showListings("active")} />
          <StatCard icon={Clock} tone="bg-amber-500/10 text-amber-600" label="Pending swaps" value={pending} sub={pending > 0 ? "waiting on you" : "all caught up"}
            onClick={() => showSwaps("pending")} />
          <StatCard icon={Repeat} tone="bg-emerald-500/10 text-emerald-600" label="Completed swaps" value={completed} sub={`${user?.swaps ?? completed} lifetime`}
            onClick={() => showSwaps("completed")} />
          <StatCard icon={Wallet} tone="bg-violet-500/10 text-violet-600" label="Swap credits" value={user?.credits ?? 0} sub="open credits wallet"
            onClick={() => setCreditsOpen(true)} />
          <StatCard icon={Star} tone="bg-amber-400/15 text-amber-500" label="Your rating" value={<RatingStars rating={user?.rating ?? 0} />} sub={`${user?.ratingCount ?? 0} reviews · view profile`}
            href={`/seller/${user?.username}`} className="max-md:col-span-2" />
        </div>

        {/* ── Seller Analytics (best feature) ───────────────────────── */}
        <SellerAnalyticsCard analytics={analytics.data} loading={analytics.isLoading} />

        {/* ── Main grid — premium mobile ———————————————————————————— */}
        <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] max-md:mt-6 max-md:gap-5">
          <div className="min-w-0">
            {/* Tabs — mobile: premium pill bar with snap, desktop unchanged */}
            <div className="flex gap-1.5 overflow-x-auto rounded-2xl border border-border bg-card p-1.5 shadow-sm snap-x snap-mandatory scrollbar-none max-md:-mx-4 max-md:rounded-none max-md:border-x-0 max-md:bg-background/80 max-md:backdrop-blur max-md:px-4 max-md:py-2 max-md:gap-2 max-md:shadow-none max-md:border-b">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => goTab(id)}
                  className={cn(
                    "inline-flex shrink-0 snap-start items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 max-md:rounded-full max-md:px-5 max-md:py-3 max-md:text-[13px] max-md:min-h-11 max-md:shadow-sm",
                    tab === id ? "bg-foreground text-background shadow-md max-md:shadow-lg" : "text-foreground/60 hover:bg-muted hover:text-foreground max-md:border max-md:border-border max-md:bg-card",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {id === "swaps" && totalUnread > 0 && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", tab === id ? "bg-brand text-white" : "bg-brand/10 text-brand")}>{totalUnread}</span>
                  )}
                  {id === "matches" && (matches.data?.length ?? 0) > 0 && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", tab === id ? "bg-brand text-white" : "bg-brand/10 text-brand")}>{matches.data!.length}</span>
                  )}
                  {id === "following" && (followingUsers.data?.length ?? 0) > 0 && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", tab === id ? "bg-brand text-white" : "bg-brand/10 text-brand")}>{followingUsers.data!.length}</span>
                  )}
                  {id === "followers" && (followerUsers.data?.length ?? 0) > 0 && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-xs font-bold", tab === id ? "bg-brand text-white" : "bg-brand/10 text-brand")}>{followerUsers.data!.length}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="pt-6">
              {tab === "listings" && (
                <MyListings items={listings.data} loading={listings.isLoading} filter={listingFilter} onFilterChange={setListingFilter} />
              )}
              {tab === "swaps" && (
                <SwapHistory
                  items={allSwaps}
                  loading={swaps.isLoading}
                  filter={swapFilter}
                  onFilterChange={setSwapFilter}
                  hasMore={hasMoreSwaps}
                  loadingMore={loadingMore}
                  onLoadMore={loadMoreSwaps}
                />
              )}
              {tab === "matches" && <SwapMatches items={matches.data} loading={matches.isLoading} />}
              {tab === "following" && (
                <div className="space-y-8">
                  <ConnectionList
                    title="Following"
                    users={followingUsers.data}
                    loading={followingUsers.isLoading}
                    onRemove={async (username) => {
                      await removeFollowingUser(username);
                      await followingUsers.refetch();
                      await followingFeed.refetch();
                    }}
                    onMessage={async (username) => {
                      const result = await startConversation(username, "Hi! I wanted to say hello.");
                      void navigate({ to: "/messages/$conversationId", params: { conversationId: result.conversationId } });
                    }}
                  />
                  <FollowingFeed items={followingFeed.data} loading={followingFeed.isLoading} />
                </div>
              )}
              {tab === "followers" && (
                <ConnectionList
                  title="Followers"
                  users={followerUsers.data}
                  loading={followerUsers.isLoading}
                  onRemove={async (username) => {
                    await removeFollowerUser(username);
                    await followerUsers.refetch();
                  }}
                  onMessage={async (username) => {
                    const result = await startConversation(username, "Hi! Thanks for following me.");
                    void navigate({ to: "/messages/$conversationId", params: { conversationId: result.conversationId } });
                  }}
                />
              )}
            </div>
          </div>

          {/* ── Sidebar ────────────────────────────────────────────── */}
          {/* Desktop sidebar — unchanged */}
          <aside className="hidden md:block space-y-5">
            <ProfileStrength percent={profilePercent} checks={checks} />
            <ImpactCard swaps={analytics.data?.completedSwaps ?? completed} listings={listings.data?.length ?? 0} />
            <CreditsCard credits={user?.credits ?? 0} onOpen={() => setCreditsOpen(true)} />
            <ActivityFeed items={activity} />
            <QuickLinks />
          </aside>
          {/* Mobile sidebar — classic accordion, thumb-friendly. Local to this file only, so free to restyle without touching desktop. */}
          <aside className="md:hidden space-y-3.5">
            <CreditsCard credits={user?.credits ?? 0} onOpen={() => setCreditsOpen(true)} />

            <details open className="group rounded-[1.75rem] border border-amber-100 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden open:shadow-[0_8px_28px_rgba(180,130,40,0.08)] transition-shadow">
              <summary className="relative flex min-h-14 list-none items-center justify-between px-5 py-4 text-sm font-black tracking-tight cursor-pointer active:bg-amber-50/40">
                <span className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600"><ShieldCheck className="h-4 w-4" /></span>
                  Profile strength
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-black text-amber-700">{profilePercent}%</span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-foreground/40 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-amber-100/70 px-5 pb-5 pt-4">
                <ProfileStrength percent={profilePercent} checks={checks} />
              </div>
            </details>

            <details className="group rounded-[1.75rem] border border-amber-100 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden open:shadow-[0_8px_28px_rgba(180,130,40,0.08)] transition-shadow">
              <summary className="flex min-h-14 list-none items-center justify-between px-5 py-4 text-sm font-black tracking-tight cursor-pointer active:bg-amber-50/40">
                <span className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><TrendingUp className="h-4 w-4" /></span>
                  Your impact
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-foreground/40 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-amber-100/70 px-5 pb-5 pt-4">
                {/* compact: avoids nesting a full heavy card inside the accordion's own card chrome */}
                <ImpactCard swaps={analytics.data?.completedSwaps ?? completed} listings={listings.data?.length ?? 0} compact showCTA={false} />
              </div>
            </details>

            <details className="group rounded-[1.75rem] border border-amber-100 bg-card shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden open:shadow-[0_8px_28px_rgba(180,130,40,0.08)] transition-shadow">
              <summary className="flex min-h-14 list-none items-center justify-between px-5 py-4 text-sm font-black tracking-tight cursor-pointer active:bg-amber-50/40">
                <span className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><Bell className="h-4 w-4" /></span>
                  Recent activity
                  {activity.length > 0 && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-black text-brand">{activity.length}</span>}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-foreground/40 transition-transform group-open:rotate-180" />
              </summary>
              <div className="border-t border-amber-100/70 px-5 pb-5 pt-4">
                <ActivityFeed items={activity} />
              </div>
            </details>

            <div className="rounded-[1.75rem] border border-amber-100 bg-card p-5 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="flex items-center gap-2 text-sm font-black tracking-tight">
                <span className="h-1.5 w-1.5 rounded-full bg-gradient-to-r from-amber-600 to-amber-400" /> Shortcuts
              </h3>
              <div className="mt-4 grid grid-cols-3 gap-2.5">
                {[
                  { to: "/sell", label: "List", icon: Plus },
                  { to: "/bag", label: "Bag", icon: Heart },
                  { to: "/saved-searches", label: "Searches", icon: Search },
                  { to: "/notifications", label: "Alerts", icon: Bell },
                  { to: "/settings", label: "Settings", icon: Settings },
                  { to: "/faq", label: "Help", icon: ShieldCheck },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-amber-100/70 bg-gradient-to-b from-amber-50/40 to-transparent text-center transition active:scale-[0.96] active:from-amber-50"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-card text-amber-700 shadow-sm ring-1 ring-amber-100"><l.icon className="h-4 w-4" /></span>
                    <span className="text-[11px] font-bold leading-none">{l.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <CreditsModal
        open={creditsOpen}
        onClose={() => setCreditsOpen(false)}
        credits={user?.credits ?? 0}
        swaps={allSwaps}
        listings={listings.data ?? []}
      />
      <Link
        to="/sell"
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-50 inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-3 text-sm font-black text-background shadow-[0_16px_30px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-0.5 md:hidden"
      >
        <Plus className="h-4 w-4" />
        New listing
      </Link>
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Shared bits ─────────────────────────── */

function timeAgo(iso: string) {
  let lang = "en-GB";
  try {
    const raw = window.localStorage.getItem("swapt.preferences");
    if (raw) lang = (JSON.parse(raw) as { language?: string }).language ?? lang;
  } catch { /* ignore */ }
  return relativeTime(lang, iso);
}

function RatingStars({ rating, className }: { rating: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={cn("h-4 w-4", i <= Math.round(rating) ? "fill-amber-400 text-amber-400" : "fill-foreground/15 text-foreground/15")} />
      ))}
    </span>
  );
}

function StatCard({ icon: Icon, tone, label, value, sub, onClick, href, className }: {
  icon: typeof Package; tone: string; label: string; value: ReactNode; sub: string;
  onClick?: () => void; href?: string; className?: string;
}) {
  const clickable = Boolean(onClick || href);
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className={cn("grid h-9 w-9 place-items-center rounded-xl", tone)}>
          <Icon className="h-4.5 w-4.5" />
        </span>
        <span className={cn(
          "grid h-6 w-6 place-items-center rounded-full transition-colors",
          clickable ? "text-foreground/25 group-hover:bg-brand/10 group-hover:text-brand" : "text-transparent",
        )}>
          <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-black tracking-tight">{value}</p>
      <p className="text-xs font-semibold text-foreground/60">{label}</p>
      <p className={cn("mt-0.5 truncate text-xs", clickable ? "text-brand/70" : "text-foreground/40")}>{sub}</p>
    </>
  );
  const base = cn(
    "group relative block w-full text-left rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 max-md:rounded-[1.5rem] max-md:p-5 max-md:shadow-[0_4px_20px_rgba(0,0,0,0.04)] max-md:border-border/60",
    clickable ? "cursor-pointer hover:-translate-y-1 hover:border-brand/30 hover:shadow-lg hover:shadow-brand/10 active:scale-[0.98] max-md:active:scale-[0.97]" : "cursor-default",
    className,
  );
  if (href) return <Link to={href} className={base}>{body}</Link>;
  if (onClick) return <button onClick={onClick} className={base}>{body}</button>;
  return <div className={base}>{body}</div>;
}

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  hidden: "bg-muted text-foreground/70",
  swapped: "bg-surface-lavender text-foreground/80",
  draft: "bg-amber-100 text-amber-800",
  scheduled: "bg-sky-100 text-sky-700",
  flagged: "bg-rose-100 text-rose-700",
  pending: "bg-amber-100 text-amber-900",
  accepted: "bg-emerald-100 text-emerald-800",
  completed: "bg-emerald-100 text-emerald-800",
  declined: "bg-red-100 text-red-800",
  cancelled: "bg-muted text-foreground/70",
};

function Badge({ children }: { children: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", statusStyles[children] ?? "bg-muted")}>
      {children}
    </span>
  );
}

function EmptyState({ icon: Icon = Package, title, body, children }: { icon?: typeof Package; title: string; body: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-muted text-foreground/40">
        <Icon className="h-6 w-6" />
      </span>
      <p className="mt-4 text-lg font-black tracking-tight">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-foreground/60">{body}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

function SkeletonGrid({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

/* ─────────────────────────── My listings ─────────────────────────── */

function MyListings({ items, loading, filter, onFilterChange }: {
  items?: MyListing[]; loading: boolean; filter: ListingFilter; onFilterChange: (f: ListingFilter) => void;
}) {
  const [q, setQ] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [boostingId, setBoostingId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { refresh } = useAuth();

  const boost = async (l: MyListing) => {
    if (!window.confirm(`Boost “${l.title}” for 30 credits? It will be featured at the top of browse for 7 days.`)) return;
    setBoostingId(l.id);
    try {
      await boostListing(l.id);
      await qc.invalidateQueries({ queryKey: ["me", "listings"] });
      await refresh();
      toast.success(`“${l.title}” is now featured! ✨`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't boost. Check your credits.");
    } finally {
      setBoostingId(null);
    }
  };

  const remove = async (l: MyListing) => {
    if (!window.confirm(`Delete “${l.title}”? This can't be undone.`)) return;
    setDeletingId(l.id);
    try {
      await deleteListing(l.id);
      await qc.invalidateQueries({ queryKey: ["me", "listings"] });
      toast.success(`"${l.title}" deleted`);
    } catch {
      toast.error("Couldn't delete the listing. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleVisibility = async (l: MyListing) => {
    setTogglingId(l.id);
    const willHide = l.status === "active";
    try {
      await setListingVisibility(l.id, willHide);
      await qc.invalidateQueries({ queryKey: ["me", "listings"] });
      toast.success(willHide ? `"${l.title}" hidden` : `"${l.title}" is now visible`);
    } catch {
      toast.error("Couldn't update visibility. Please try again.");
    } finally {
      setTogglingId(null);
    }
  };

  const publishDraft = async (l: MyListing) => {
    setPublishingId(l.id);
    try {
      await publishListing(l.id);
      await qc.invalidateQueries({ queryKey: ["me", "listings"] });
      toast.success(`“${l.title}” published!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't publish — check required fields and photo.");
    } finally {
      setPublishingId(null);
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (items ?? []).filter((l) => {
      if (filter === "flagged") {
        if (l.moderationStatus !== "flagged") return false;
      } else if (filter !== "all" && l.status !== filter) return false;
      if (!needle) return true;
      return [l.title, l.brand, l.category, l.size].some((f) => f.toLowerCase().includes(needle));
    });
  }, [items, q, filter]);

  if (loading) return <SkeletonGrid />;
  if (!items?.length) {
    return (
      <EmptyState icon={Package} title="No listings yet" body="Post your first piece and it'll show up here for swappers to discover.">
        <Link to="/sell" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand/85 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/25 transition-all hover:-translate-y-0.5">
          <Plus className="h-4 w-4" /> List your first item
        </Link>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar — mobile premium, desktop unchanged */}
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between max-md:rounded-3xl max-md:p-4 max-md:shadow-[0_4px_20px_rgba(0,0,0,0.04)] max-md:border-border/60">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your listings…"
            className="w-full rounded-2xl border border-border bg-background py-3.5 pl-10 pr-3 text-[16px] outline-none transition-all placeholder:text-sm focus:border-brand/50 focus:ring-4 focus:ring-brand/10 sm:rounded-xl sm:py-2.5 sm:pl-9 sm:text-sm min-h-12 max-md:shadow-sm"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-none max-md:gap-2.5 max-md:scroll-px-4 max-md:pb-1.5 max-md:-mx-1 max-md:px-1">
          <button
            onClick={() => onFilterChange("draft")}
            className={cn("shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold min-h-11", filter === "draft" ? "bg-amber-600 text-white" : "border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100")}
          >
            Drafts ({items?.filter((item) => item.status === "draft").length ?? 0})
          </button>
          {LISTING_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={cn(
                "shrink-0 snap-start rounded-full px-4 py-2.5 text-sm font-semibold capitalize transition-all min-h-11",
                filter === f ? "bg-foreground text-background shadow-sm" : "border border-border bg-background text-foreground/60 hover:bg-muted active:bg-muted",
              )}
            >
              {f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            const fallback = () =>
              toCsv(
                ["id", "title", "brand", "category", "size", "value", "status", "featured", "meetup", "createdAt"],
                (items ?? []).map((l) => [l.id, l.title, l.brand, l.category, l.size, l.value, l.status, l.featured ? "true" : "false", l.meetup ? "true" : "false", l.createdAt]),
              );
            void downloadApiCsv("/api/me/listings/export.csv", "swapt-listings.csv", fallback);
          }}
          className="inline-flex w-full min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-3.5 text-sm font-semibold transition-colors hover:bg-muted active:bg-muted sm:w-auto"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No matching listings" body="Try a different search or status filter." />
      ) : (
        <div className="grid grid-cols-2 gap-4 max-md:gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filtered.map((l) => (
            <div key={l.id} className="group">
              <Link to="/listing/$id" params={{ id: l.id }}>
                <div className="relative overflow-hidden rounded-2xl bg-muted shadow-sm transition-all duration-200 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-brand/10">
                  <img src={l.images[0]} alt={l.title} loading="lazy" className="aspect-[3/4] w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
                    {l.featured && (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white shadow-md flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Featured{l.featuredUntil ? ` · ${Math.max(0, Math.ceil((new Date(l.featuredUntil).getTime() - Date.now())/86400000))}d left` : ""}
                      </span>
                    )}
                    <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-xs font-bold capitalize shadow-md", statusStyles[l.status])}>
                      {l.status}
                    </span>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-6">
                    <p className="text-sm font-bold text-white">{l.value} <span className="font-medium text-white/70">credits</span></p>
                  </div>
                </div>
                <div className="mt-2 px-0.5">
                  <p className="truncate text-sm font-semibold">{l.title}</p>
                  <p className="truncate text-xs text-foreground/60">{l.brand} · size {l.size} · {timeAgo(l.createdAt)}</p>
                </div>
              </Link>
              <div className="mt-1.5 flex items-center gap-1.5 px-0.5 max-md:grid max-md:grid-cols-3 max-md:gap-1.5">
                {(l.status === "active" || l.status === "hidden") && (
                  <button
                    type="button"
                    onClick={() => void toggleVisibility(l)}
                    disabled={togglingId === l.id}
                    aria-label={l.status === "active" ? `Hide ${l.title}` : `Show ${l.title}`}
                    className="inline-flex flex-1 min-h-11 items-center justify-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-foreground/50 transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-50 max-md:px-2 max-md:text-xs max-md:rounded-xl"
                  >
                    {togglingId === l.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : l.status === "active" ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                    {l.status === "active" ? "Hide" : "Show"}
                  </button>
                )}
                {l.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => void publishDraft(l)}
                    disabled={publishingId === l.id}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2.5 text-sm min-h-11 font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 max-md:px-2 max-md:text-xs max-md:rounded-xl"
                  >
                    {publishingId === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                    Publish
                  </button>
                )}
                {l.status === "scheduled" && (
                  <button
                    type="button"
                    onClick={() => void publishDraft(l)}
                    disabled={publishingId === l.id}
                    className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-sky-600 px-2 py-2.5 text-sm min-h-11 font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50 max-md:px-2 max-md:text-xs max-md:rounded-xl"
                  >
                    {publishingId === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Clock className="h-3 w-3" />}
                    Publish now
                  </button>
                )}
                <Link
                  to="/edit-listing/$id"
                  params={{ id: l.id }}
                  className="inline-flex flex-1 min-h-11 items-center justify-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-foreground/70 transition-colors hover:border-brand/40 hover:text-brand max-md:px-2 max-md:text-xs max-md:rounded-xl"
                >
                  <PenLine className="h-3 w-3" /> Edit
                </Link>
                <button
                  type="button"
                  onClick={() => void remove(l)}
                  disabled={deletingId === l.id}
                  aria-label={`Delete ${l.title}`}
                  className="inline-flex flex-1 min-h-11 items-center justify-center gap-1 rounded-xl border border-border px-3 py-2.5 text-sm font-bold text-foreground/50 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 max-md:px-2 max-md:text-xs max-md:rounded-xl"
                >
                  {deletingId === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                  Delete
                </button>
              </div>
              {l.moderationStatus === "flagged" && (
                <div className="mt-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2 py-2.5 text-sm min-h-11">
                  <p className="font-bold text-rose-700 flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Flagged — pending review</p>
                  <p className="text-rose-600/80 line-clamp-2">{l.moderationReason || "Auto-flagged by proactive moderation"}</p>
                </div>
              )}
              {l.status === "scheduled" && l.publishAt && (
                <div className="mt-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-2.5 text-sm min-h-11">
                  <p className="font-bold text-sky-700 flex items-center gap-1"><Clock className="h-3 w-3" /> Scheduled</p>
                  <p className="text-sky-600/80">Publishes {new Date(l.publishAt).toLocaleString()}</p>
                </div>
              )}
              {l.status === "draft" && (
                <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-2.5 text-sm min-h-11 font-bold text-amber-700">Draft — finish & publish when ready</div>
              )}
              {l.status === "active" && l.returnWindowDays !== undefined && (
                <div className="mt-1 text-xs text-foreground/50 text-center">Returns: {l.returnWindowDays === 0 ? "No returns" : `${l.returnWindowDays} days`}{l.returnPolicy ? ` · ${l.returnPolicy}` : ""}</div>
              )}
              {l.status === "active" && (
                <div className="mt-1.5">
                  {l.featured ? (
                    <span className="flex w-full min-h-11 items-center justify-center gap-1 rounded-xl bg-gradient-to-r from-amber-400 via-brand to-violet-500 px-3 py-2.5 text-sm font-black text-white shadow-sm"><Sparkles className="h-3 w-3" /> Boosted • Top of browse</span>
                  ) : (
                    <button onClick={() => void boost(l)} disabled={boostingId === l.id} className="flex w-full min-h-11 items-center justify-center gap-1 rounded-xl bg-foreground px-3 py-2.5 text-sm font-bold text-background hover:bg-foreground/90 disabled:opacity-50">
                      {boostingId === l.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />} Boost for 30 cr ↗
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Swap history ────────────────────────── */

function SwapHistory({ items, loading, filter, onFilterChange, hasMore, loadingMore, onLoadMore }: {
  items?: SwapRecord[]; loading: boolean; filter: SwapFilter; onFilterChange: (f: SwapFilter) => void;
  hasMore?: boolean; loadingMore?: boolean; onLoadMore?: () => void;
}) {
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState<SwapRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteChat = async () => {
    if (!confirming) return;
    setDeleting(true);
    try {
      await deleteConversation(confirming.conversationId);
      setConfirming(null);
      await qc.invalidateQueries({ queryKey: ["me", "swaps"] });
      await qc.invalidateQueries({ queryKey: ["me", "unread"] });
      toast.success("Chat deleted");
    } catch (err) {
      console.error("Couldn't delete chat", err);
      toast.error("Couldn't delete chat. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const filtered = useMemo(() => {
    const list = items ?? [];
    if (filter === "all") return list;
    if (filter === "other") return list.filter((s) => s.status === "declined" || s.status === "cancelled");
    return list.filter((s) => s.status === filter);
  }, [items, filter]);

  if (loading) return <SkeletonGrid rows={3} />;
  if (!items?.length) {
    return (
      <EmptyState icon={ArrowLeftRight} title="No swaps yet" body="When you propose or receive a swap, the full history lands here." />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none snap-x snap-mandatory max-md:-mx-4 max-md:px-4 max-md:scroll-ps-4 max-md:gap-2 max-md:pb-2">
        {SWAP_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onFilterChange(f.id)}
            className={cn(
              "shrink-0 snap-start rounded-full px-4 py-2.5 text-sm font-semibold transition-all min-h-11 max-md:px-5 max-md:py-3 max-md:text-[13px] max-md:shadow-sm",
              filter === f.id ? "bg-foreground text-background shadow-sm max-md:shadow-md" : "border border-border bg-card text-foreground/60 hover:bg-muted active:bg-muted max-md:bg-card max-md:border-border/60",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="Nothing here" body="No swaps match this filter." />
      ) : (
        <ul className="space-y-3">
          {filtered.map((s) => (
            <li key={s.id} className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lg max-md:rounded-3xl max-md:p-4 max-md:shadow-[0_4px_20px_rgba(0,0,0,0.04)] max-md:border-border/60">
              <div className="flex flex-wrap items-center gap-3 sm:gap-4 max-md:gap-3.5">
                <div className="relative flex -space-x-3">
                  {(() => {
                    const bundle = (s.offeredBundle?.length ? s.offeredBundle : (s.offeredListings?.length ? s.offeredListings : (s.offeredListing ? [s.offeredListing] : []))) as any[];
                    const images = [s.requestedListing, ...bundle].filter(Boolean) as any[];
                    return images.slice(0,4).map((l) => (
                      <img key={l!.id} src={l!.images[0]} alt={l!.title} className="h-16 w-16 rounded-xl border-2 border-background object-cover shadow-sm max-md:h-14 max-md:w-14 max-md:rounded-xl" />
                    ));
                  })()}
                  <span className="absolute -bottom-1.5 -right-1.5 grid h-6 w-6 place-items-center rounded-full bg-foreground text-background ring-2 ring-card">
                    <ArrowLeftRight className="h-3 w-3" />
                  </span>
                  {(() => {
                    const bundle = (s.offeredBundle?.length ? s.offeredBundle : (s.offeredListings?.length ? s.offeredListings : (s.offeredListing ? [s.offeredListing] : []))) as any[];
                    return bundle.length > 1 ? <span className="absolute -top-1 -right-1 rounded-full bg-brand px-1.5 py-0.5 text-xs font-black text-white ring-2 ring-card">{bundle.length}→1</span> : null;
                  })()}
                </div>

                <div className="min-w-[12rem] flex-1 max-md:min-w-0 max-md:flex-[1_1_100%]">
                  <div className="flex items-center gap-2">
                    <Avatar url={s.counterparty.avatarUrl} name={s.counterparty.name} size={26} />
                    <p className="text-sm font-bold max-md:text-[13px]">
                      {s.direction === "incoming" ? "Request from" : "Your request to"} {s.counterparty.name}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground/60 max-md:text-[11px] max-md:leading-relaxed line-clamp-2">
                    {s.requestedListing?.title ?? "Listing"}
                    {(() => {
                      const bundle = (s.offeredBundle?.length ? s.offeredBundle : (s.offeredListings?.length ? s.offeredListings : (s.offeredListing ? [s.offeredListing] : []))) as any[];
                      if (!bundle.length) return null;
                      if (bundle.length === 1) return <span className="text-foreground/40"> ↔ {bundle[0].title}</span>;
                      return <span className="text-foreground/40"> ↔ {bundle.map((b:any)=>b.title).join(" + ")} ({bundle.length} items)</span>;
                    })()}
                    <span className="text-foreground/40"> · {new Date(s.createdAt).toLocaleDateString()}</span>
                  </p>
                  {s.message && <p className="mt-1 truncate text-xs italic text-foreground/55 max-md:whitespace-normal max-md:line-clamp-2 max-md:leading-relaxed">“{s.message}”</p>}
                  {s.meetup && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-surface-lavender px-2.5 py-2 text-sm min-h-9 font-semibold text-foreground/70 max-md:px-3 max-md:py-1.5 max-md:text-xs">
                      <MapPin className="h-3.5 w-3.5" /> Meetup{s.meetupPlace ? ` · ${s.meetupPlace}` : ""}
                    </p>
                  )}
                  {s.shipping && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-2 text-sm min-h-9 font-semibold text-sky-700 max-md:px-3 max-md:py-1.5 max-md:text-xs">
                      <Truck className="h-3.5 w-3.5" /> Shipping
                      {s.trackingNumber ? ` · ${s.carrier || "carrier"} ${s.trackingNumber}` : " · awaiting tracking"}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-start gap-2 sm:items-end w-full sm:w-auto max-md:flex-row max-md:flex-wrap max-md:items-center max-md:justify-between max-md:w-full max-md:gap-2 max-md:mt-1">
                  <div className="flex flex-wrap items-center gap-2 max-md:gap-1.5 max-md:flex-1">
                    {s.dispute && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-2 text-sm min-h-9 font-bold text-red-700">
                        <ShieldCheck className="h-3.5 w-3.5" /> Dispute {s.dispute.status}
                      </span>
                    )}
                    {s.unreadCount > 0 && (
                      <span className="inline-flex min-h-7 items-center rounded-full bg-brand px-2.5 py-2 text-sm min-h-9 font-bold text-white">
                        {s.unreadCount} new
                      </span>
                    )}
                    <Badge>{s.status}</Badge>
                  </div>
                  <Link
                    to="/swaps/$id"
                    params={{ id: s.id }}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all",
                      s.unreadCount > 0
                        ? "bg-brand text-white shadow-md shadow-brand/25 hover:-translate-y-0.5"
                        : "border border-border text-foreground/70 hover:border-brand/40 hover:text-brand",
                    )}
                  >
                    {s.status === "pending" && s.direction === "incoming" ? "Respond" : "Open chat"}
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                  <button
                    onClick={() => setConfirming(s)}
                    title="Delete this chat"
                    aria-label={`Delete chat with ${s.counterparty.name}`}
                    className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-xl border border-transparent px-3 py-2 text-sm font-semibold text-foreground/50 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:bg-rose-100"
                  >
                    <Trash2 className="h-4 w-4" /> Delete chat
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete this chat?"
        description={`This conversation with ${confirming?.counterparty.name ?? "the other member"} will be removed from your swap history. The other member keeps their copy.`}
        confirmLabel="Delete chat"
        variant="danger"
        busy={deleting}
        onConfirm={deleteChat}
        onClose={() => setConfirming(null)}
      />

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-xs font-semibold transition-all hover:-translate-y-0.5 hover:bg-muted disabled:opacity-60"
          >
            {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Load older swaps
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Swap matches ────────────────────────── */

function signalLabel(s: string) {
  if (s === "saved") return "Saved listing";
  if (s === "swap_request") return "Proposed a swap";
  if (s === "saved_search") return "Saved search";
  return s;
}

function SwapMatches({ items, loading }: { items?: SwapMatch[]; loading: boolean }) {
  if (loading) return <SkeletonGrid rows={2} />;
  if (!items?.length) {
    return (
      <EmptyState
        icon={Sparkles}
        title="No matches yet"
        body="List what you own and save items you want — when someone wants your piece and you want theirs, mutual swaps surface here."
      >
        <div className="flex gap-2">
          <Link to="/sell" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand/85 px-4 py-2.5 text-sm font-bold text-white shadow-md shadow-brand/25 transition-all hover:-translate-y-0.5">
            <Plus className="h-4 w-4" /> List an item
          </Link>
          <Link to="/browse" className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:bg-muted">
            <Heart className="h-4 w-4" /> Save items
          </Link>
        </div>
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-4">
      {items.map((m) => (
        <li key={m.id} className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-emerald-500/10">
          <div className="flex flex-wrap items-center gap-3 p-4 pb-0">
            <Avatar url={m.counterparty.avatarUrl} name={m.counterparty.name} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-bold">{m.counterparty.name}</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  <Sparkles className="h-3 w-3" /> {m.score}/5 match
                </span>
              </div>
              <p className="text-xs text-foreground/55">@{m.counterparty.username} · mutual swap</p>
            </div>
            <Link
              to="/listing/$id"
              params={{ id: m.theirListing.id }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-foreground px-4 py-2.5 text-xs font-bold text-background shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Start swap
            </Link>
          </div>

          <div className="flex items-stretch gap-3 p-4">
            <MatchCard image={m.theirListing.image} title={m.theirListing.title} meta={`${m.theirListing.brand} · Size ${m.theirListing.size}`} side="their" />
            <div className="flex flex-col items-center justify-center gap-0.5 px-0.5">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50">
                <ArrowLeftRight className="h-4 w-4" />
              </span>
              <span className="text-xs font-black uppercase tracking-widest text-foreground/45">swap</span>
            </div>
            <MatchCard image={m.yourListing.image} title={m.yourListing.title} meta={`${m.yourListing.brand} · ${m.yourListing.value} credits`} side="yours" />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-emerald-100 px-4 py-3">
            {[...m.signals.youWant, ...m.signals.theyWant].map((s) => (
              <span key={s} className="rounded-full bg-emerald-100/70 px-2.5 py-2 text-sm min-h-9 font-semibold text-emerald-800">
                {signalLabel(s)}
              </span>
            ))}
            <span className="ml-auto text-xs font-semibold text-foreground/60">
              You want their {m.theirListing.title.toLowerCase()} — they want your {m.yourListing.title.toLowerCase()}.
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function MatchCard({ image, title, meta, side }: { image: string; title: string; meta: string; side: "their" | "yours" }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-background">
        <img src={image} alt={title} className="aspect-square w-full object-cover transition-transform duration-500 hover:scale-105" />
        <span className={cn(
          "absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow-md",
          side === "their" ? "bg-emerald-600" : "bg-brand",
        )}>
          {side === "their" ? "Theirs" : "Yours"}
        </span>
      </div>
      <p className="mt-1.5 truncate text-xs font-semibold">{title}</p>
      <p className="truncate text-xs text-foreground/55">{meta}</p>
    </div>
  );
}

/* ─────────────────────────── Sidebar cards ───────────────────────── */

function ProfileStrength({ percent, checks }: { percent: number; checks: { label: string; done: boolean; icon: typeof Camera }[] }) {
  const done = checks.filter((c) => c.done).length;
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black tracking-tight">Profile strength</h3>
        <span className={cn("rounded-full px-2.5 py-2 text-sm min-h-9 font-black", percent === 100 ? "bg-emerald-100 text-emerald-700" : "bg-brand/10 text-brand")}>
          {percent === 100 ? "Perfect" : `${percent}%`}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", percent === 100 ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-brand to-brand/60")}
          style={{ width: `${Math.max(percent, 6)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-foreground/55">
        {done === checks.length ? "Your profile looks great — swappers will trust you instantly." : `Complete ${checks.length - done} more step${checks.length - done > 1 ? "s" : ""} to look trustworthy.`}
      </p>
      <ul className="mt-3 space-y-1.5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-sm">
            {c.done ? (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-emerald-600"><Check className="h-3 w-3" /></span>
            ) : (
              <span className="grid h-5 w-5 place-items-center rounded-full border border-dashed border-foreground/25 text-foreground/30"><c.icon className="h-3 w-3" /></span>
            )}
            <span className={c.done ? "text-foreground/60" : "font-medium text-foreground/80"}>{c.label}</span>
          </li>
        ))}
      </ul>
      {done < checks.length && (
        <Link to="/settings" className="mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border py-2.5 text-xs font-bold transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand">
          <Settings className="h-3.5 w-3.5" /> Complete profile
        </Link>
      )}
    </div>
  );
}

function CreditsCard({ credits, onOpen }: { credits: number; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-violet-500 to-brand p-5 text-left text-white shadow-lg shadow-violet-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-violet-500/35">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_70%_at_100%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-black tracking-tight">
            <Wallet className="h-4 w-4" /> Swap credits
          </h3>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold ring-1 ring-white/20">Balance</span>
        </div>
        <p className="mt-3 text-4xl font-black tracking-tight">{credits.toLocaleString()}</p>
        <p className="mt-1 text-xs text-white/70">Spend them on items you love, or earn more by swapping.</p>
        <span className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3 py-2 text-xs font-bold text-white backdrop-blur transition-colors hover:bg-white/20">
          View credits wallet <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}

function ActivityFeed({ items }: { items: { id?: string; icon: typeof Bell; tone: string; text: string; at: string; read?: boolean }[] }) {
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:p-0 max-md:shadow-none">
      <h3 className="flex items-center gap-1.5 text-sm font-black tracking-tight">
        <Circle className="h-3.5 w-3.5 fill-brand text-brand" /> Recent activity
      </h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/55">Nothing yet — once you list, swap or get messages, it shows up here.</p>
      ) : (
        <ul className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {items.map((a, i) => (
            <li key={a.id ?? i} className={cn("flex items-start gap-3 rounded-xl p-1.5", a.read === false && "bg-brand/[0.04]")}>
              <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl", a.tone)}>
                <a.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm leading-snug", a.read === false ? "font-semibold text-foreground" : "text-foreground/80")}>{a.text}</p>
                <p className="mt-0.5 text-xs font-medium text-foreground/40">{timeAgo(a.at)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && <Link to="/notifications" className="mt-4 inline-flex text-xs font-bold text-brand hover:underline">View all notifications</Link>}
    </div>
  );
}

function QuickLinks() {
  const links: { to: string; label: string; icon: typeof Heart; hint: string }[] = [
    { to: "/sell", label: "List an item", icon: Plus, hint: "Add a new piece" },
    { to: "/bag", label: "Wishlist", icon: Heart, hint: "Items you saved" },
    { to: "/saved-searches", label: "Saved searches", icon: Search, hint: "Auto-matched finds" },
    { to: "/notifications", label: "Notifications", icon: Bell, hint: "Alerts & updates" },
    { to: "/faq", label: "Help center", icon: ShieldCheck, hint: "FAQs & support" },
    { to: "/settings", label: "Settings", icon: Settings, hint: "Profile & privacy" },
  ];
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <h3 className="text-sm font-black tracking-tight">Shortcuts</h3>
      <ul className="mt-3 space-y-1">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="group flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors hover:bg-muted">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-foreground/60 transition-colors group-hover:bg-brand/10 group-hover:text-brand">
                <l.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{l.label}</span>
                <span className="block text-xs text-foreground/45">{l.hint}</span>
              </span>
              <ChevronRight className="h-4 w-4 text-foreground/25 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SellerAnalyticsCard({ analytics, loading }: { analytics?: import("@/lib/dashboard-api").SellerAnalytics; loading: boolean }) {
  if (loading) {
    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="mt-4 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      </div>
    );
  }
  if (!analytics || analytics.totalListings === 0) return null;
  return (
    <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-black tracking-tight"><TrendingUp className="h-4 w-4 text-brand" /> Seller analytics</h3>
        <span className="rounded-full bg-brand/10 px-2.5 py-2 text-sm min-h-9 font-bold text-brand">{analytics.totalListings} listings</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-gradient-to-br from-brand/10 to-brand/5 p-3 text-center">
          <p className="text-xl font-black">{analytics.totalViews.toLocaleString()}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Total views</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-violet-500/5 p-3 text-center">
          <p className="text-xl font-black">{analytics.totalSaves.toLocaleString()}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Saves</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-3 text-center">
          <p className="text-xl font-black">{analytics.completedSwaps}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Completed</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-xl bg-muted p-2"><p className="font-black">{analytics.active}</p><p className="text-foreground/50">Active</p></div>
        <div className="rounded-xl bg-muted p-2"><p className="font-black">{analytics.pendingSwaps}</p><p className="text-foreground/50">Pending</p></div>
        <div className="rounded-xl bg-muted p-2"><p className="font-black">{analytics.swapped}</p><p className="text-foreground/50">Swapped</p></div>
      </div>
      {analytics.topListings.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Top performing</p>
          <ul className="mt-2 space-y-2">
            {analytics.topListings.map((l) => (
              <li key={l.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
                {l.image ? <img src={l.image} alt={l.title} className="h-10 w-10 rounded-lg object-cover" /> : <span className="h-10 w-10 rounded-lg bg-muted" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold">{l.title}</p>
                  <p className="text-xs text-foreground/50">{l.views} views · {l.saves} saves · {l.value} cr</p>
                </div>
                <Link to="/listing/$id" params={{ id: l.id }} className="text-xs font-bold text-brand hover:underline">View</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

type ConnectionUser = { username: string; displayName: string; avatarUrl: string | null };

function ConnectionList({
  title,
  users,
  loading,
  onRemove,
  onMessage,
}: {
  title: string;
  users?: ConnectionUser[];
  loading: boolean;
  onRemove: (username: string) => Promise<void>;
  onMessage: (username: string) => Promise<void>;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [busyUser, setBusyUser] = useState<string | null>(null);

  const runAction = async (username: string, action: () => Promise<void>) => {
    if (busyUser) return;
    setBusyUser(username);
    try {
      await action();
      setOpenMenu(null);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't update this connection.");
    } finally {
      setBusyUser(null);
    }
  };

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
        <span className="text-xs font-semibold text-foreground/50">{users?.length ?? 0} member{users?.length === 1 ? "" : "s"}</span>
      </div>
      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : !users?.length ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-foreground/55">
          No {title.toLowerCase()} yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {users.map((member) => (
            <div key={member.username} className="relative flex items-center gap-3 rounded-2xl border border-border bg-card p-3.5 shadow-sm">
              <Link to="/seller/$username" params={{ username: member.username }} className="flex min-w-0 flex-1 items-center gap-3 hover:text-brand">
                <Avatar url={member.avatarUrl} name={member.displayName} size={46} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold">{member.displayName}</span>
                  <span className="block truncate text-xs text-foreground/55">@{member.username}</span>
                </span>
              </Link>
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setOpenMenu((current) => current === member.username ? null : member.username)}
                  aria-label={`Actions for ${member.displayName}`}
                  aria-expanded={openMenu === member.username}
                  className="grid h-9 w-9 place-items-center rounded-full text-foreground/45 transition hover:bg-muted hover:text-foreground"
                >
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {openMenu === member.username && (
                  <div className="absolute right-0 top-10 z-20 w-40 rounded-xl border border-border bg-card p-1.5 shadow-xl">
                    <button
                      type="button"
                      disabled={busyUser === member.username}
                      onClick={() => void runAction(member.username, () => onRemove(member.username))}
                      className="flex w-full items-center rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                    >
                      {busyUser === member.username ? "Removing…" : title === "Following" ? "Remove following" : "Remove follower"}
                    </button>
                    <button
                      type="button"
                      disabled={busyUser === member.username}
                      onClick={() => void runAction(member.username, () => onMessage(member.username))}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-50"
                    >
                      <MessageCircle className="h-4 w-4" /> Message
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function FollowingFeed({ items, loading }: { items?: import("@/lib/dashboard-api").FollowingFeedItem[]; loading: boolean }) {
  if (loading) {
    return <div className="grid grid-cols-2 gap-3"><div className="h-32 animate-pulse rounded-2xl bg-muted" /><div className="h-32 animate-pulse rounded-2xl bg-muted" /></div>;
  }
  if (!items || items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-border p-10 text-center">
        <Heart className="mx-auto h-8 w-8 text-foreground/20" />
        <p className="mt-3 text-sm font-bold">No following feed yet</p>
        <p className="mt-1 text-sm text-foreground/60">Follow sellers you love — their newest listings will appear here.</p>
        <Link to="/browse" className="mt-4 inline-flex rounded-full bg-foreground px-4 py-2 text-sm font-bold text-background">Discover sellers</Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map((l) => (
        <Link key={l.id} to="/listing/$id" params={{ id: l.id }} className="group overflow-hidden rounded-2xl border border-border bg-card hover:-translate-y-1 hover:shadow-lg transition">
          <div className="aspect-square overflow-hidden bg-muted">
            <img src={l.images[0]} alt={l.title} className="h-full w-full object-cover group-hover:scale-105 transition" />
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-bold">{l.title}</p>
            <p className="text-xs text-foreground/60">{l.brand} · {l.value} cr</p>
            {l.seller && <p className="mt-1 flex items-center gap-1 text-xs text-foreground/50"><Avatar url={l.seller.avatarUrl} name={l.seller.name} size={16} /> @{l.seller.username}</p>}
          </div>
        </Link>
      ))}
    </div>
  );
}