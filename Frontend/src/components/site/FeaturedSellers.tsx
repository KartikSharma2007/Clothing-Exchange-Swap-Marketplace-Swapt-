import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Star, Users } from "lucide-react";
import { Avatar } from "@/components/site/Avatar";
import { fetchFeaturedSellers, type SellerProfile } from "@/lib/featured-sellers-api";

export function FeaturedSellers() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["featured-sellers"],
    queryFn: () => fetchFeaturedSellers(4),
  });

  if (isLoading) {
    return (
      <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <SectionHeading />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SellerSkeleton key={index} />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-foreground/60">
          Couldn't load featured sellers. Try again later.
        </div>
      </section>
    );
  }

  const sellers = data?.items ?? [];
  if (sellers.length === 0) return null;

  return (
    <section className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Users className="h-5 w-5 text-brand" /> Featured Sellers
          </h2>
          <p className="mt-1 text-sm text-foreground/60">Discover closets worth swapping with</p>
        </div>
        <Link to="/browse" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
          Browse sellers <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sellers.map((seller) => (
          <SellerCard key={seller.id} seller={seller} />
        ))}
      </div>
    </section>
  );
}

function SectionHeading() {
  return (
    <h2 className="mb-6 flex items-center gap-2 text-2xl font-black tracking-tight">
      <Users className="h-5 w-5 text-brand" /> Featured Sellers
    </h2>
  );
}

function SellerCard({ seller }: { seller: SellerProfile }) {
  return (
    <Link
      to="/seller/$username"
      params={{ username: seller.username }}
      className="group rounded-2xl border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lg"
    >
      <div className="flex items-center gap-3">
        <Avatar url={seller.avatarUrl} name={seller.name} size={52} />
        <div className="min-w-0">
          <h3 className="truncate font-black text-foreground">{seller.name}</h3>
          <p className="truncate text-sm text-foreground/55">@{seller.username}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-foreground/60">
        <span className="inline-flex items-center gap-1">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {seller.rating.toFixed(1)}
        </span>
        <span>{seller.swaps} swaps</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {seller.listings.slice(0, 3).map((listing) => (
          <img
            key={listing.id}
            src={listing.images?.[0] ?? ""}
            alt={listing.title}
            className="aspect-square w-full rounded-xl bg-muted object-cover"
          />
        ))}
      </div>
    </Link>
  );
}

function SellerSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="h-[52px] w-[52px] rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="mt-4 h-3 w-1/2 rounded bg-muted" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="aspect-square rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
