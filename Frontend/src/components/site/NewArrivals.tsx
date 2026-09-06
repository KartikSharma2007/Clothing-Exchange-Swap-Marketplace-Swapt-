import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { fetchNewArrivals, type NewArrival } from "@/lib/new-arrivals-api";

export function NewArrivals() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["new-arrivals"],
    queryFn: () => fetchNewArrivals(8),
  });

  const arrivals = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <h2 className="mb-6 flex items-center gap-2 text-2xl font-black tracking-tight">
          <Loader2 className="h-5 w-5 text-brand animate-spin" /> New Arrivals
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <ArrivalSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-foreground/60">
          Couldn't load new arrivals. Try again later.
        </div>
      </div>
    );
  }

  if (arrivals.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground/60">
          No new arrivals yet. Check back soon!
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Loader2 className="h-5 w-5 text-brand mr-2" /> New Arrivals
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Fresh listings added today
          </p>
        </div>
        <Link to="/browse" className="text-sm font-semibold text-brand hover:underline">
          See all new
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4 lg:gap-6">
        {arrivals.map((arrival) => (
          <ArrivalCard key={arrival.id} arrival={arrival} />
        ))}
      </div>
    </div>
  );
}

function ArrivalCard({ arrival }: { arrival: NewArrival }) {
  return (
    <Link to={`/listing/${arrival.id}`} className="group block">
      <div className="rounded-2xl border border-border bg-background overflow-hidden hover:shadow-lg transition-all duration-300 group-hover:border-brand/50">
        <div className="relative">
          <img
            src={arrival.images?.[0] ?? ""}
            alt={arrival.title}
            className="h-48 w-full object-cover"
          />
          {/* New tag */}
          <div className="absolute top-2 left-2 bg-brand text-white text-xs font-bold px-2 py-1 rounded">
            New
          </div>
          {/* Save button placeholder */}
          <button
            aria-label="Save item"
            className="absolute top-2 right-2 p-1 rounded-full bg-white/90 hover:bg-white/80 transition-all"
          >
            <span className="text-[--size-4]">+</span>
          </button>
        </div>
        <div className="p-4">
          <h3 className="text-lg font-black line-clamp 2">{arrival.title}</h3>
          <p className="mt-2 text-sm text-foreground/60">
            {arrival.brand} · {arrival.size} · {arrival.condition}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-brand">
              {arrival.value} credits
            </span>
            <div className="flex items-center gap-1 text-xs text-foreground/50">
              <span className="text-xs">👁�</span>
              <span>{arrival.views?.toLocaleString() ?? "0"}</span>
              <span className="mx-2">•</span>
              <span className="text-xs">💾</span>
              <span>{arrival.saves?.toLocaleString() ?? "0"}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ArrivalSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-background overflow-hidden animate-pulse">
      <div className="h-48 w-full bg-muted" />
      <div className="p-4">
        <h3 className="text-lg font-black line-clamp 2 mb-2">
          <div className="h-4 w-3/4 rounded bg-muted mb-1" />
          <div className="h-3 w-1/2 rounded bg-muted mb-1" />
          <div className="h-2 w-1/3 rounded bg-muted" />
        </h3>
        <div className="mt-2 flex items-center justify-between">
          <span className="h-3 w-16 rounded bg-muted" />
          <div className="flex items-center gap-1 text-xs text-foreground/50">
            <span className="h-2 w-3 rounded bg-muted" />
            <span className="mx-1">•</span>
            <span className="h-2 w-3 rounded bg-muted" />
          </div>
        </div>
      </div>
    </div>
  );
}