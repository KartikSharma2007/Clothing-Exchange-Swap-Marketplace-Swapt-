import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Hero } from "@/components/site/Hero";
import { PromoBanner } from "@/components/site/PromoBanner";
import { CategoryQuiz } from "@/components/site/CategoryQuiz";
import { StyleGrid } from "@/components/site/StyleGrid";
import { PopularBrands } from "@/components/site/PopularBrands";
import { PopularWeek } from "@/components/site/PopularWeek";
import { PriceTiles } from "@/components/site/PriceTiles";
import { Footer } from "@/components/site/Footer";
import { ListingCard } from "@/components/site/ListingCard";
import { ImpactCard } from "@/components/site/ImpactCard";
import { fetchRecommended, fetchPopular } from "@/lib/recommendations-api";
import { useAuth } from "@/lib/auth-context";
import { readRecentlyViewed } from "@/lib/recently-viewed";
import { useQuery as useQ } from "@tanstack/react-query";
import { fetchSellerAnalytics } from "@/lib/dashboard-api";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Swapt — Swap preloved clothing" },
      { name: "description", content: "A marketplace for swapping preloved clothes. Trade what you own for something new-to-you." },
      { property: "og:title", content: "Swapt — Swap preloved clothing" },
      { property: "og:description", content: "Trade the pieces in your closet for something new-to-you. No cash, just great taste." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { user } = useAuth();

  const recommended = useQuery({
    queryKey: ["recommendations", "for-you"],
    queryFn: () => fetchRecommended(8),
    enabled: !!user,
  });

  const popular = useQuery({
    queryKey: ["recommendations", "popular"],
    queryFn: () => fetchPopular(8),
  });

  const analytics = useQ({
    queryKey: ["me", "analytics-home"],
    queryFn: fetchSellerAnalytics,
    enabled: !!user,
  });

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <Hero />
        <PromoBanner />
        <CategoryQuiz />
        <StyleGrid />
        {user ? (
          <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
            <header className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black tracking-tight">Recommended for you</h2>
                <p className="mt-1 text-sm text-foreground/60">Picked from your saved items, searches and fits.</p>
              </div>
              <Link to="/browse" className="text-sm font-semibold text-brand hover:underline">
                Browse all
              </Link>
            </header>
            {recommended.isLoading ? (
              <RowSkeleton />
            ) : recommended.isError ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-foreground/60">Couldn't load recommendations. Try again later.</div>
            ) : (recommended.data?.length ?? 0) === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground/60">No recommendations yet — save items or searches to get personalized picks.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-5">
                {recommended.data?.map((l) => (
                  <ListingCard key={l.id} listing={l} matchLabel="Because you like this" />
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
            <div className="rounded-3xl border border-brand/20 bg-brand/[0.04] p-6 text-center md:p-8">
              <h2 className="text-xl font-black tracking-tight">Get personal recommendations</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-foreground/60">Log in to see picks based on your saved items, searches and fit.</p>
              <div className="mt-4 flex justify-center gap-3">
                <Link to="/login" className="rounded-full bg-foreground px-6 py-2.5 text-sm font-bold text-background">Log in</Link>
                <Link to="/browse" className="rounded-full border border-border bg-background px-6 py-2.5 text-sm font-bold">Browse all</Link>
              </div>
            </div>
          </section>
        )}
        <PopularBrands />
        {user && analytics.data && (
          <section className="mx-auto max-w-[1400px] px-4 py-6 md:px-8">
            <div className="mx-auto max-w-2xl">
              <ImpactCard swaps={analytics.data.completedSwaps} listings={analytics.data.totalListings} />
              <p className="mt-2 text-center text-xs text-foreground/50">Based on Ellen MacArthur &amp; WRAP: 1.8 kg waste, 2700 L water, 6.5 kg CO₂ saved per swap.</p>
            </div>
          </section>
        )}
        <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
          <header className="mb-6 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight">Trending this week</h2>
              <p className="mt-1 text-sm text-foreground/60">Most-saved and most-viewed pieces right now.</p>
            </div>
            <Link to="/browse" search={{ tag: "trending" }} className="text-sm font-semibold text-brand hover:underline">
              See trending
            </Link>
          </header>
          {popular.isLoading ? (
            <RowSkeleton />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-5">
              {popular.data?.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </section>
        <RecentlyViewed />
        <PopularWeek />
        <PriceTiles />
      </main>
      <Footer />
    </div>
  );
}

function RowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-square rounded-2xl bg-muted" />
          <div className="mt-2.5 h-4 w-3/4 rounded bg-muted" />
          <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}

function RecentlyViewed() {
  const items = readRecentlyViewed();
  if (items.length === 0) return null;
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Clock className="h-5 w-5 text-brand" /> Recently viewed
          </h2>
          <p className="mt-1 text-sm text-foreground/60">Pick up where you left off.</p>
        </div>
        <Link to="/browse" className="text-sm font-semibold text-brand hover:underline">
          Browse all
        </Link>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4 md:gap-5">
        {items.slice(0, 8).map((l) => (
          <ListingCard key={l.id} listing={l} />
        ))}
      </div>
    </section>
  );
}