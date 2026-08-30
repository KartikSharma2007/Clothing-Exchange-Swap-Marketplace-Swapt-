import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  Bookmark,
  ChevronRight,
  Coins,
  Flag,
  Link2,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Repeat,
  Search,
  Share2,
  ShieldCheck,
  Star,
  UserCheck,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Avatar } from "@/components/site/Avatar";
import { ReportDialog } from "@/components/site/ReportDialog";
import { ConfirmDialog } from "@/components/site/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";
import { fetchSellerProfile, fetchUserConnections, fetchUserSwaps, followUser, unfollowUser, type SellerProfile, type SellerProfileListing } from "@/lib/users-api";
import { fetchUserReviews, type Review } from "@/lib/reviews-api";
import { api, apiEnabled } from "@/lib/api";
import { proposeSwap, startConversation } from "@/lib/swap-api";
import { muteUser, unmuteUser } from "@/lib/moderation-api";
import { cn } from "@/lib/utils";
import { localeFromPrefs } from "@/lib/i18n";
import { toast } from "sonner";

const TABS = [
  { id: "closet", label: "Closet", icon: <Bookmark className="h-4 w-4" /> },
  { id: "swapped", label: "Swapped", icon: <Repeat className="h-4 w-4" /> },
  { id: "reviews", label: "Reviews", icon: <Star className="h-4 w-4" /> },
  { id: "followers", label: "Followers", icon: <Users className="h-4 w-4" /> },
  { id: "following", label: "Following", icon: <UserCheck className="h-4 w-4" /> },
  { id: "about", label: "About", icon: <Search className="h-4 w-4" /> },
] as const;

type Tab = (typeof TABS)[number]["id"];

type SwapHistory = {
  id: string;
  mine: { id: string; title: string; image: string } | null;
  theirs: { id: string; title: string; image: string } | null;
  mineCredits: number;
  theirsCredits: number;
  otherUser: string;
  otherName: string;
  date: string;
};

export const Route = createFileRoute("/seller/$username")({
  loader: async ({ params }) => {
    const profile = await fetchSellerProfile(params.username);
    if (!profile) throw notFound();
    return profile;
  },
  head: ({ loaderData }) => {
    const title = loaderData
      ? `${loaderData.user.displayName} — Swap profile · Swapt`
      : "Seller profile — Swapt";
    return {
      meta: [
        { title },
        { name: "description", content: loaderData?.user.bio || "View a fashion-first swap profile." },
        { property: "og:title", content: title },
        { property: "og:description", content: loaderData?.user.bio || "View a fashion-first swap profile." },
      ],
    };
  },
  component: SellerProfilePage,
});

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "Available"
      ? "bg-emerald-500/10 text-emerald-700"
      : status === "Swap Pending"
      ? "bg-amber-500/10 text-amber-700"
      : status === "Unavailable"
      ? "bg-rose-500/10 text-rose-700"
      : "bg-slate-500/10 text-slate-700";
  return <span className={cn("rounded-full px-2.5 py-2 text-sm min-h-9 font-semibold", tone)}>{status}</span>;
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-center gap-3">
        <Avatar url={review.author.avatarUrl} name={review.author.name} size={44} />
        <div>
          <p className="font-semibold text-foreground">{review.author.name}</p>
          <p className="text-xs text-foreground/50">
            @{review.author.username} · {new Date(review.createdAt).toLocaleDateString(localeFromPrefs())}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1 text-foreground">
        {Array.from({ length: 5 }).map((_, index) => (
          <Star key={index} className={cn("h-4 w-4", index < Math.round(review.rating) ? "fill-amber-500 text-amber-500" : "text-foreground/30")} />
        ))}
        <span className="ml-2 text-sm font-semibold">{review.rating.toFixed(1)}</span>
      </div>
      {review.comment && <p className="mt-4 text-sm leading-6 text-foreground/80">“{review.comment}”</p>}
    </div>
  );
}

/** One side of a completed swap — a cloth card, a credits tile, or both. */
function SwapSide({
  label,
  item,
  credits,
  flow,
}: {
  label: string;
  item: { id: string; title: string; image: string } | null;
  credits: number;
  flow: "paid" | "received";
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">{label}</p>
      {item ? (
        <>
          <div className="overflow-hidden rounded-2xl bg-muted">
            <img src={item.image} alt={item.title} className="aspect-[4/3] w-full object-cover" />
          </div>
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          {credits > 0 && (
            <p className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700">
              <Coins className="h-3 w-3" /> {flow === "paid" ? "Paid" : "Received"} {credits} credits
            </p>
          )}
        </>
      ) : credits > 0 ? (
        <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-amber-100 to-amber-50 ring-1 ring-amber-200/60">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-amber-500/15">
            <Coins className="h-6 w-6 text-amber-600" />
          </span>
          <p className="text-lg font-black text-amber-700">{credits} credits</p>
          <p className="text-xs font-bold uppercase tracking-wider text-amber-600/70">
            {flow === "paid" ? "Paid in credits" : "Received in credits"}
          </p>
        </div>
      ) : (
        <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-muted text-xs text-foreground/45">—</div>
      )}
    </div>
  );
}

function SwapCard({ swap }: { swap: SwapHistory }) {
  const when = swap.date
    ? new Date(swap.date).toLocaleDateString(localeFromPrefs(), { month: "short", year: "numeric" })
    : "";
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <SwapSide label="Their item" item={swap.theirs} credits={swap.theirsCredits} flow="received" />
        <div className="flex items-center justify-center">
          <span className="rounded-full bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-wide text-foreground/60">swapped with</span>
        </div>
        <SwapSide label="Your item" item={swap.mine} credits={swap.mineCredits} flow="paid" />
      </div>
      <p className="mt-4 text-sm text-foreground/70">
        Swapped with <span className="font-semibold text-foreground">@{swap.otherUser || swap.otherName}</span>
        {when ? ` · ${when}` : ""}
      </p>
    </div>
  );
}

function MessageModal({
  open,
  onClose,
  username,
  listings,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  username: string;
  listings: SellerProfileListing[];
  onSend: (message: string, listingId: string) => Promise<void> | void;
}) {
  const [message, setMessage] = useState("Hi — I love your closet. Is this still available?");
  const [listingId, setListingId] = useState("");
  // "message" = plain text chat, "swap" = attach a specific item to request.
  const [mode, setMode] = useState<"message" | "swap">("message");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode("message");
      setListingId("");
      setMessage("Hi — I love your closet. Is this still available?");
      setBusy(false);
    }
  }, [open, listings]);

  if (!open) return null;

  const canSend = message.trim().length > 0 && !busy && (mode === "message" || Boolean(listingId));

  const submit = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      await onSend(message.trim(), mode === "swap" ? listingId : "");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 shadow-2xl max-md:max-h-[85dvh] max-md:overflow-y-auto max-md:p-5 max-md:rounded-2xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Message @{username}</p>
            <h2 className="mt-2 text-xl font-black text-foreground">Say hi, or request a swap</h2>
          </div>
          <button onClick={onClose} className="text-foreground/60 transition hover:text-foreground">
            Close
          </button>
        </div>

        {/* Mode toggle — plain message by default; item picker only for swaps */}
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-full border border-border bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("message")}
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
              mode === "message" ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground"
            }`}
          >
            Send a message
          </button>
          <button
            type="button"
            onClick={() => setMode("swap")}
            className={`rounded-full px-3 py-2 text-xs font-bold transition ${
              mode === "swap" ? "bg-background text-foreground shadow-sm" : "text-foreground/55 hover:text-foreground"
            }`}
          >
            Request a swap
          </button>
        </div>

        {mode === "swap" && listings.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-border bg-muted p-4 text-sm text-foreground/70">
            This seller has no active listings right now, so there's nothing to swap yet — send a plain message instead.
          </p>
        ) : (
          <>
            {mode === "swap" && (
              <>
                <p className="mt-5 text-xs font-bold uppercase tracking-wider text-foreground/50">Swap this item</p>
                <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                  {listings.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setListingId(item.id)}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
                        listingId === item.id ? "border-foreground bg-muted" : "border-border hover:bg-muted/60"
                      }`}
                    >
                      <img src={item.images[0]} alt={item.title} className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-foreground">{item.title}</p>
                        <p className="text-xs text-foreground/60">{item.brand} · {item.size}</p>
                      </div>
                      <span className="shrink-0 text-xs font-bold text-foreground/70">{item.value} credits</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              rows={4}
              className="mt-4 w-full rounded-2xl border border-border bg-muted p-4 text-sm text-foreground outline-none transition focus:border-foreground"
            />
            <p className="mt-2 text-xs text-foreground/50">
              {mode === "swap"
                ? "Your request is sent as a swap with shipping — the seller can switch to a local meetup if they prefer."
                : "A plain-text chat — no swap is created. You can request an item later from the chat."}
            </p>
          </>
        )}

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={() => void submit()}
            disabled={!canSend}
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background transition hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
            {busy ? "Sending…" : mode === "swap" ? "Send request" : "Send message"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ImagePreviewModal({ open, imageUrl, onClose }: { open: boolean; imageUrl: string | null; onClose: () => void }) {
  if (!open || !imageUrl) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/75 p-4 backdrop-blur-sm">
      <div className="relative flex h-[min(78vw,30rem)] w-[min(78vw,30rem)] items-center justify-center">
        <img
          src={imageUrl}
          alt="Profile preview"
          className="h-full w-full rounded-full border-4 border-background object-cover object-center shadow-2xl ring-1 ring-white/40"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close profile photo"
          className="absolute right-3 top-3 h-10 w-10 grid place-items-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SellerProfilePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, listings } = Route.useLoaderData() as SellerProfile;
  const { user: authUser, isAuthenticated } = useAuth();
  const isOwnProfile = isAuthenticated && authUser?.username === user.username;
  const [activeTab, setActiveTab] = useState<Tab>("closet");
  const [following, setFollowing] = useState(Boolean(user.isFollowing));
  const [followers, setFollowers] = useState(user.followers ?? 0);
  const [followBusy, setFollowBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [mutedByMe, setMutedByMe] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const profileTabsRef = useRef<HTMLElement | null>(null);
  const [profileTabsAtEnd, setProfileTabsAtEnd] = useState(false);

  useEffect(() => {
    const tabs = profileTabsRef.current;
    if (!tabs) return;
    const updateTabOverflow = () => {
      setProfileTabsAtEnd(tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4);
    };
    updateTabOverflow();
    tabs.addEventListener("scroll", updateTabOverflow, { passive: true });
    window.addEventListener("resize", updateTabOverflow);
    return () => {
      tabs.removeEventListener("scroll", updateTabOverflow);
      window.removeEventListener("resize", updateTabOverflow);
    };
  }, []);

  const userReviews = useQuery({
    queryKey: ["user-reviews", user.username],
    queryFn: () => fetchUserReviews(user.username),
    enabled: apiEnabled,
  });

  const userSwaps = useQuery({
    queryKey: ["user-swaps", user.username],
    queryFn: () => fetchUserSwaps(user.username),
    enabled: apiEnabled,
  });

  const connections = useQuery({
    queryKey: ["user-connections", user.username, activeTab],
    queryFn: () => fetchUserConnections(user.username, activeTab as "followers" | "following"),
    enabled: activeTab === "followers" || activeTab === "following",
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (isAuthenticated && apiEnabled) {
          const [blocks, mutes] = await Promise.all([
            api<{ items: { username: string }[] }>("/api/me/blocks", { method: "GET" }),
            api<{ items: { username: string }[] }>("/api/me/mutes", { method: "GET" }),
          ]);
          if (!mounted) return;
          setBlockedByMe((blocks?.items || []).some((i) => i.username === user.username));
          setMutedByMe((mutes?.items || []).some((i) => i.username === user.username));
        } else {
          const blocked = JSON.parse(window.localStorage.getItem("swapt.blockedUsers") || "[]");
          setBlockedByMe(blocked.includes(user.username));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isAuthenticated, apiEnabled, user.username]);

  const headerStats = [
    { label: "Followers", value: followers },
    { label: "Following", value: user.following ?? 0 },
    { label: "Swaps", value: user.swaps },
    { label: "Rating", value: `${Math.round(user.rating * 10) / 10}` },
    { label: "Reliability", value: user.reliability != null ? `${user.reliability}%` : "—" },
  ];

  const toggleFollow = async () => {
    if (isOwnProfile) return;
    if (!isAuthenticated) {
      void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
      return;
    }
    if (followBusy) return;
    setFollowBusy(true);
    try {
      if (apiEnabled) {
        if (following) {
          const res = await unfollowUser(user.username);
          setFollowing(false);
          setFollowers(res.followers ?? Math.max(0, followers - 1));
        } else {
          const res = await followUser(user.username);
          setFollowing(true);
          setFollowers(res.followers ?? followers + 1);
        }
        await qc.invalidateQueries({ queryKey: ["seller-profile", user.username] });
      } else {
        setFollowing((f) => !f);
      }
    } catch (err) {
      console.error(err);
      toast.error("Couldn't update follow.");
    } finally {
      setFollowBusy(false);
    }
  };

  // Share / copy / report / block handlers
  const shareProfile = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: `${user.displayName} on Swapt`, url });
        return;
      } catch {
        // user cancelled
      }
    }
    try {
      await navigator.clipboard?.writeText(url);
      toast.success("Profile link copied to clipboard");
    } catch {
      toast("Copy this profile link", { description: url });
    }
  };

  const copyLink = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard?.writeText(url);
      toast.success("Profile link copied to clipboard");
    } catch {
      toast("Copy this profile link", { description: url });
    }
  };

  const reportUser = () => {
    if (!isAuthenticated) {
      void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
      return;
    }
    setReportOpen(true);
    setMenuOpen(false);
  };

  const confirmBlock = async () => {
    if (!isAuthenticated) {
      setBlockConfirmOpen(false);
      void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
      return;
    }
    if (apiEnabled) {
      try {
        await api<{ blocked: boolean }>("/api/me/blocks", { method: "POST", body: { username: user.username } });
        setBlockedByMe(true);
        // Blocking removes the follow in both directions server-side — mirror
        // it here so the header never keeps showing a stale "following" state.
        if (following) {
          setFollowing(false);
          setFollowers((f) => Math.max(0, f - 1));
        }
        void qc.invalidateQueries({ queryKey: ["seller-profile", user.username] });
        toast.success(`@${user.username} has been blocked.`);
      } catch (err) {
        console.error(err);
        toast.error("Couldn't block user.");
      }
    } else {
      const blocked = JSON.parse(window.localStorage.getItem("swapt.blockedUsers") || "[]");
      if (!blocked.includes(user.username)) blocked.push(user.username);
      window.localStorage.setItem("swapt.blockedUsers", JSON.stringify(blocked));
      setBlockedByMe(true);
      if (following) {
        setFollowing(false);
        setFollowers((f) => Math.max(0, f - 1));
      }
      toast.success(`@${user.username} has been blocked.`);
    }
    setBlockConfirmOpen(false);
    setMenuOpen(false);
  };

  const unblockUser = async () => {
    if (apiEnabled && isAuthenticated) {
      try {
        await api<{ blocked: boolean }>(`/api/me/blocks/${user.username}`, { method: "DELETE" });
        setBlockedByMe(false);
        toast.success(`@${user.username} has been unblocked.`);
      } catch (err) {
        console.error(err);
        toast.error("Couldn't unblock user.");
      }
    } else {
      const blocked: string[] = JSON.parse(window.localStorage.getItem("swapt.blockedUsers") || "[]");
      const filtered = blocked.filter((b: string) => b !== user.username);
      window.localStorage.setItem("swapt.blockedUsers", JSON.stringify(filtered));
      setBlockedByMe(false);
      toast.success(`@${user.username} has been unblocked.`);
    }
    setMenuOpen(false);
  };

  const blockUser = () => {
    if (!isAuthenticated) {
      void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
      return;
    }
    setBlockConfirmOpen(true);
  };

  const toggleMute = async () => {
    if (blockedByMe) return; // mute is meaningless for someone you've blocked
    if (!isAuthenticated) {
      void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
      return;
    }
    if (apiEnabled) {
      try {
        if (mutedByMe) {
          await unmuteUser(user.username);
          setMutedByMe(false);
          toast.success(`Unmuted @${user.username}.`);
        } else {
          await muteUser(user.username);
          setMutedByMe(true);
          toast.success(`Muted @${user.username} — you won't get their notifications.`);
        }
      } catch (err) {
        console.error(err);
        toast.error("Couldn't update mute settings.");
      }
    } else {
      setMutedByMe((m) => !m);
      toast.success(mutedByMe ? `Unmuted @${user.username}.` : `Muted @${user.username}.`);
    }
    setMenuOpen(false);
  };

  const handleSendMessage = async (message: string, listingId: string) => {
    if (!isAuthenticated) {
      void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
      return;
    }

    // No listing chosen → a plain-text chat, no swap proposal.
    if (!listingId) {
      try {
        const { conversationId } = await startConversation(user.username, message);
        setMessageOpen(false);
        void navigate({ to: "/messages/$conversationId", params: { conversationId } });
      } catch (err) {
        console.error(err);
        toast.error("Couldn't start a conversation. Please try again.");
      }
      return;
    }

    // The modal only enables Send when a listing is selected, but keep the
    // guard so a stale click can't create a swap without a target item.
    const target = listings.find((l) => l.id === listingId);
    if (!target) {
      toast.error("Pick an item to swap for first.");
      return;
    }

    try {
      // Default to shipping so the swap always has a way to complete — a swap
      // with no delivery method can never be finished and locks its escrow.
      const id = await proposeSwap({ requestedListing: target.id, message, shipping: true, carrier: "usps" });
      setMessageOpen(false);
      void navigate({ to: "/swaps/$id", params: { id } });
    } catch (err) {
      console.error(err);
      toast.error("Couldn't start a conversation. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 max-md:pb-20">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-10 max-md:px-4 max-md:py-5">
        {/* ── Profile header ─────────────────────────────────────── */}
        <div className="rounded-3xl border border-border bg-card shadow-sm max-md:rounded-2xl max-md:shadow-[0_4px_16px_rgba(0,0,0,0.06)]">
          <div className="relative h-28 w-full overflow-hidden rounded-t-[calc(1.5rem-1px)] bg-gradient-to-r from-brand/25 via-brand/10 to-purple-500/15 sm:h-36 max-md:h-24 max-md:rounded-t-[calc(1rem-1px)]">
            <div className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-purple-400/25 blur-2xl" />
            <div className="absolute -bottom-16 -left-8 h-44 w-44 rounded-full bg-sky-400/25 blur-2xl" />
            <div className="absolute right-6 top-5 hidden items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-sm min-h-9 font-bold uppercase tracking-wider text-foreground/70 shadow-sm backdrop-blur sm:flex">
              <Users className="h-3.5 w-3.5" /> Member since {new Date(user.createdAt).getFullYear()}
            </div>
          </div>
          <div className="px-6 pb-6 sm:px-8 max-md:px-4 max-md:pb-5">
            <div className="-mt-14 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between max-md:-mt-10 max-md:gap-4">
              <div className="flex items-end gap-4 max-md:gap-3 max-md:items-center">
                <div className="relative shrink-0 rounded-full bg-card p-1 shadow-sm ring-1 ring-border max-md:p-1">
                  <Avatar
                    url={user.avatarUrl}
                    name={user.displayName}
                    size={120}
                    className="ring-2 ring-background max-md:!h-[88px] max-md:!w-[88px]"
                    onClick={() => setAvatarPreviewOpen(true)}
                  />
                  {user.phoneVerified && (
                    <span
                      className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-card bg-emerald-500 text-white shadow-md max-md:h-6 max-md:w-6"
                      title="Phone verified"
                    >
                      <BadgeCheck className="h-4 w-4 max-md:h-3.5 max-md:w-3.5" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 pb-1 max-md:pb-0">
                  <div className="flex flex-wrap items-center gap-2 max-md:gap-1.5">
                    <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl max-md:text-xl max-md:leading-tight">{user.displayName}</h1>
                    {user.verifiedSeller && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-0.5 text-xs font-semibold text-sky-700" title="Verified seller">
                        <ShieldCheck className="h-3.5 w-3.5" /> Verified seller
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-foreground/60">@{user.username}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {user.phoneVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        <BadgeCheck className="h-3.5 w-3.5" /> Phone verified
                      </span>
                    )}
                    {user.reliability != null && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" /> {user.reliability}% reliable
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:pb-1 max-md:gap-2 max-md:w-full">
                {isOwnProfile ? (
                  <span className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground/60 max-md:w-full max-md:min-h-12 max-md:justify-center">
                    <UserCheck className="h-4 w-4" /> This is you
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => void toggleFollow()}
                      disabled={blockedByMe || followBusy}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition-all max-md:flex-1 max-md:min-h-12 max-md:justify-center max-md:px-4",
                        following
                          ? "border border-border bg-background text-foreground hover:border-brand/40 hover:text-brand"
                          : "bg-gradient-to-r from-brand to-brand/85 text-white shadow-md shadow-brand/25 hover:-translate-y-0.5",
                        (blockedByMe || followBusy) && "cursor-not-allowed opacity-50",
                      )}
                    >
                      {blockedByMe ? (
                        <Ban className="h-4 w-4" />
                      ) : following ? (
                        <UserCheck className="h-4 w-4" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      {blockedByMe ? "Blocked" : following ? "Following" : "Follow"}
                    </button>
                    <button
                      onClick={() => {
                        if (blockedByMe) return;
                        if (!isAuthenticated) {
                          void navigate({ to: "/login", search: { next: `/seller/${user.username}` } });
                          return;
                        }
                        setMessageOpen(true);
                      }}
                      disabled={blockedByMe}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand max-md:flex-1 max-md:min-h-12 max-md:justify-center max-md:px-4",
                        blockedByMe && "cursor-not-allowed opacity-50",
                      )}
                    >
                      <MessageCircle className="h-4 w-4" /> {blockedByMe ? "Message disabled" : "Message"}
                    </button>
                  </>
                )}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((open) => !open)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-background text-foreground transition hover:rotate-90 hover:border-brand/40 hover:text-brand"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                  {menuOpen && (
                    <div className="absolute right-0 z-30 mt-3 w-56 rounded-2xl border border-border bg-card p-2 shadow-2xl max-md:fixed max-md:right-3 max-md:top-[5.25rem] max-md:mt-0 max-md:max-h-[calc(100dvh-6rem)] max-md:w-[calc(100vw-1.5rem)] max-md:max-w-none max-md:overflow-y-auto">
                      <div className="border-b border-border/60 px-3 pb-2 pt-1.5">
                        <p className="text-xs font-bold uppercase tracking-wider text-foreground/45">Actions</p>
                      </div>
                      <div className="pt-1">
                        <button
                          onClick={() => { void shareProfile(); setMenuOpen(false); }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
                        >
                          <Share2 className="h-4 w-4 text-foreground/50" /> Share profile
                        </button>
                        <button
                          onClick={() => { void copyLink(); }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
                        >
                          <Link2 className="h-4 w-4 text-foreground/50" /> Copy link
                        </button>
                        <button
                          onClick={() => { reportUser(); }}
                          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
                        >
                          <Flag className="h-4 w-4 text-foreground/50" /> Report user
                        </button>
                        {!blockedByMe && (
                          <button
                            onClick={() => { void toggleMute(); }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition hover:bg-muted"
                          >
                            {mutedByMe ? <Volume2 className="h-4 w-4 text-foreground/50" /> : <VolumeX className="h-4 w-4 text-foreground/50" />}
                            {mutedByMe ? "Unmute user" : "Mute user"}
                          </button>
                        )}
                        {blockedByMe ? (
                          <button
                            onClick={() => { void unblockUser(); }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                          >
                            <UserCheck className="h-4 w-4" /> Unblock user
                          </button>
                        ) : (
                          <button
                            onClick={() => { blockUser(); }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                          >
                            <Ban className="h-4 w-4" /> Block user
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-relaxed text-foreground/75">{user.bio}</p>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-foreground/70">
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4 text-foreground/50" /> {user.location || "Location not set"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-4 w-4 text-foreground/50" /> Member since {new Date(user.createdAt).toLocaleDateString(localeFromPrefs(), { month: "short", year: "numeric" })}
              </span>
            </div>

            {/* Stats — mobile 3 cols */}
            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border shadow-sm sm:grid-cols-5 max-md:grid-cols-3 max-md:gap-px">
              {headerStats.map((stat) => (
                <div key={stat.label} className="group bg-card px-4 py-4 text-center transition-colors hover:bg-muted/60 max-md:px-3 max-md:py-3">
                  <p className="text-xl font-black text-foreground transition-transform group-hover:scale-105 max-md:text-lg">{stat.value.toLocaleString()}</p>
                  <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-foreground/50 max-md:text-[10px]">{stat.label}</p>
                </div>
              ))}
            </div>

            {blockedByMe && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100/60 p-4">
                <p className="flex items-center gap-3 text-sm font-semibold text-rose-700">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
                    <Ban className="h-4.5 w-4.5" />
                  </span>
                  You've blocked @{user.username}. They can't message you or see your swaps.
                </p>
                <button
                  onClick={() => { void unblockUser(); }}
                  className="rounded-full border border-rose-300 bg-background px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  Unblock
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Tabs ───────────────────────────────────────────────── */}
        <div className="relative max-md:-mx-4 max-md:mt-5">
        <nav ref={profileTabsRef} className="mt-6 flex flex-wrap gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm max-md:mt-0 max-md:flex-nowrap max-md:gap-2 max-md:overflow-x-auto max-md:rounded-none max-md:border-x-0 max-md:px-4 max-md:py-2 max-md:pr-20 max-md:shadow-none max-md:scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition max-md:min-h-11 max-md:rounded-full max-md:px-4",
                activeTab === tab.id ? "bg-foreground text-background shadow-sm" : "text-foreground/60 hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          aria-label="Show more profile sections"
          onClick={() => profileTabsRef.current?.scrollBy({ left: 220, behavior: "smooth" })}
          className={`pointer-events-auto absolute right-0 top-0 hidden h-full w-12 items-center justify-end bg-gradient-to-l from-background via-background/95 to-transparent pr-2 text-foreground/55 max-md:flex ${profileTabsAtEnd ? "max-md:hidden" : ""}`}
        >
          <span className="flex items-center rounded-full border border-border bg-card/95 p-1 shadow-sm">
            <ChevronRight className="h-3 w-3" />
          </span>
        </button>
        </div>

        <section className="mt-8 space-y-8">
          {activeTab === "closet" && (
            <div className="space-y-6">
              {listings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center text-foreground/70">
                  <p className="text-xl font-semibold text-foreground">No items available right now</p>
                  <p className="mt-3 text-sm">Check back later or follow this user to get notified.</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {listings.map((item) => (
                    <Link
                      key={item.id}
                      to={`/listing/${item.id}`}
                      className="group overflow-hidden rounded-2xl border border-border bg-card transition duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                    >
                      <div className="relative overflow-hidden bg-muted">
                        <img
                          src={item.images[0]}
                          alt={item.title}
                          className="aspect-[4/3] w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                        <div className="absolute left-2.5 top-2.5">
                          <StatusPill status={item.status === "active" ? "Available" : item.status === "swapped" ? "Swapped" : "Unavailable"} />
                        </div>
                      </div>
                      <div className="space-y-1.5 p-3.5">
                        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-foreground/50">
                          <span>{item.brand}</span>
                          <span>{item.size}</span>
                        </div>
                        <h3 className="truncate text-sm font-black text-foreground">{item.title}</h3>
                        <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                          <span>{item.value} credits</span>
                          <span className="text-foreground/50">{item.postedDaysAgo}d ago</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "swapped" && (
            userSwaps.isLoading ? (
              <p className="flex items-center gap-2 py-10 text-sm text-foreground/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading swaps…
              </p>
            ) : !userSwaps.data || userSwaps.data.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground/55">
                No completed swaps yet. Swaps this member completes will appear here.
              </div>
            ) : (
              <div className="grid gap-5 lg:grid-cols-2">
                {userSwaps.data.items.map((swap) => (
                  <SwapCard key={swap.id} swap={swap} />
                ))}
              </div>
            )
          )}

          {activeTab === "reviews" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">Overall rating</p>
                    <div className="mt-3 flex items-center gap-4">
                      <span className="text-5xl font-black text-foreground">
                        {(userReviews.data?.rating ?? user.rating).toFixed(1)}
                      </span>
                      <div>
                        <div className="flex items-center gap-1 text-foreground">
                          {Array.from({ length: 5 }).map((_, index) => (
                            <Star key={index} className={cn("h-5 w-5", index < Math.round(userReviews.data?.rating ?? user.rating) ? "fill-amber-500 text-amber-500" : "text-foreground/20")} />
                          ))}
                        </div>
                        <p className="mt-1 text-sm text-foreground/60">Based on {userReviews.data?.ratingCount ?? user.ratingCount} reviews</p>
                      </div>
                    </div>
                  </div>

                  {userReviews.data && (
                    <div className="w-full max-w-xs space-y-2">
                      {[5, 4, 3, 2, 1].map((star) => {
                        const count = userReviews.data.distribution[star - 1] ?? 0;
                        const pct = userReviews.data.ratingCount
                          ? Math.round((count / userReviews.data.ratingCount) * 100)
                          : 0;
                        return (
                          <div key={star} className="flex items-center gap-2 text-xs text-foreground/70">
                            <span className="w-3 font-semibold">{star}</span>
                            <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                              <div className="h-full rounded-full bg-foreground" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="w-6 text-right">{count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {userReviews.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-foreground/50">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading reviews…
                </p>
              ) : !userReviews.data || userReviews.data.items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground/55">
                  No reviews yet. Reviews left on this member's items will appear here.
                </div>
              ) : (
                <div className="grid gap-4">
                  {userReviews.data.items.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeTab === "followers" || activeTab === "following") && (
            connections.isLoading ? (
              <p className="flex items-center gap-2 py-10 text-sm text-foreground/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading {activeTab}…
              </p>
            ) : !connections.data?.users.length ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-foreground/55">
                No {activeTab} yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {connections.data.users.map((member) => (
                  <Link
                    key={member.username}
                    to="/seller/$username"
                    params={{ username: member.username }}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <Avatar url={member.avatarUrl} name={member.displayName} size={48} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-foreground">{member.displayName}</span>
                      <span className="block truncate text-xs text-foreground/55">@{member.username}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )
          )}

          {activeTab === "about" && (
            <>
            <div className="hidden gap-6 max-md:grid max-md:gap-4">
              <div className="space-y-6 max-md:space-y-4">
                <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm max-md:rounded-3xl">
                  <div className="relative overflow-hidden bg-gradient-to-br from-brand/15 via-amber-50 to-emerald-50 px-6 py-5 max-md:px-5 max-md:py-6">
                    <div className="absolute -right-6 -top-8 h-24 w-24 rounded-full border-[12px] border-white/40" />
                    <p className="relative text-xs font-black uppercase tracking-[0.18em] text-brand/75">A little about</p>
                    <h3 className="relative mt-1 text-xl font-black text-foreground max-md:text-[22px]">Get to know {user.displayName.split(" ")[0]}</h3>
                  </div>
                  <div className="p-6 max-md:p-5">
                    <p className="text-sm leading-7 text-foreground/80 max-md:text-[15px] max-md:leading-7">
                      {user.bio || "This member hasn't written a bio yet."}
                    </p>
                    <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                      <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 max-md:rounded-2xl">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand"><MapPin className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-wider text-foreground/45">Based in</span><span className="block truncate text-sm font-bold text-foreground">{user.location || "Location not set"}</span></span>
                      </div>
                      <div className="flex items-center gap-3 rounded-xl bg-muted/60 p-3 max-md:rounded-2xl">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600"><Users className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block text-[10px] font-black uppercase tracking-wider text-foreground/45">Member since</span><span className="block truncate text-sm font-bold text-foreground">{new Date(user.createdAt).toLocaleDateString(localeFromPrefs(), { month: "short", year: "numeric" })}</span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 max-md:space-y-4">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm max-md:rounded-3xl max-md:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div><p className="text-xs font-black uppercase tracking-[0.18em] text-foreground/45">Trust snapshot</p><h3 className="mt-1 text-lg font-black text-foreground">Reliable to swap with</h3></div>
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-amber-500/10 text-amber-600"><ShieldCheck className="h-5 w-5" /></span>
                  </div>
                  <div className="mt-5 grid grid-cols-2 gap-2.5">
                    <div className="rounded-xl bg-amber-500/10 p-3 max-md:rounded-2xl"><Star className="h-4 w-4 fill-amber-500 text-amber-500" /><p className="mt-2 text-lg font-black">{user.rating.toFixed(1)}</p><p className="text-[10px] font-bold uppercase tracking-wide text-foreground/50">Rating</p></div>
                    <div className="rounded-xl bg-emerald-500/10 p-3 max-md:rounded-2xl"><Repeat className="h-4 w-4 text-emerald-600" /><p className="mt-2 text-lg font-black">{user.swaps}</p><p className="text-[10px] font-bold uppercase tracking-wide text-foreground/50">Swaps</p></div>
                  </div>
                  <ul className="mt-4 space-y-2.5 text-sm text-foreground/80">
                    {user.verifiedSeller && <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-sky-600" /> Verified seller</li>}
                    {user.phoneVerified && <li className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-600" /> Phone verified</li>}
                    <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-brand" /> {user.reliability != null ? `${user.reliability}% completion rate` : "New member"}</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="hidden gap-6 md:grid md:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="text-lg font-black text-foreground">About me</h3>
                  <p className="mt-4 text-sm leading-7 text-foreground/80">
                    {user.bio || "This member hasn't written a bio yet."}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <h3 className="text-lg font-black text-foreground">Trust</h3>
                  <ul className="mt-4 space-y-3 text-sm text-foreground/80">
                    {user.verifiedSeller && <li>✓ Verified seller</li>}
                    {user.phoneVerified && <li>✓ Phone verified</li>}
                    <li>✓ {user.swaps} successful swaps</li>
                    <li>✓ {user.reliability != null ? `${user.reliability}% completion rate` : "New member"}</li>
                  </ul>
                </div>
              </div>
            </div>
            </>
          )}
        </section>
      </main>

      <MessageModal open={messageOpen} username={user.username} listings={listings} onClose={() => setMessageOpen(false)} onSend={handleSendMessage} />
      <ImagePreviewModal
        open={avatarPreviewOpen}
        imageUrl={user.avatarUrl ?? null}
        onClose={() => setAvatarPreviewOpen(false)}
      />
      {reportOpen && <ReportDialog targetType="user" targetId={user.id} onClose={() => setReportOpen(false)} />}
      <ConfirmDialog
        open={blockConfirmOpen}
        title={`Block @${user.username}?`}
        description="They won't be able to message you, request swaps, or follow you. You can unblock them anytime."
        confirmLabel="Block user"
        onConfirm={() => void confirmBlock()}
        onClose={() => setBlockConfirmOpen(false)}
      />
    </div>
  );
}
