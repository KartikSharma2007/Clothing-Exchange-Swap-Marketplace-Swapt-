import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "lucide-react";
import { fetchSeasonalPicks, type SeasonalPick } from "@/lib/seasonal-picks-api";

export function SeasonalPicks() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["seasonal-picks"],
    queryFn: () => fetchSeasonalPicks(6),
  });

  const picks = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <h2 className="mb-6 flex items-center gap-2 text-2xl font-black tracking-tight">
          <Calendar className="h-5 w-5 text-brand" /> Seasonal Picks
        </h2>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-foreground/60">
          Couldn't load seasonal picks. Try again later.
        </div>
      </div>
    );
  }

  if (picks.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground/60">
          No seasonal picks available yet.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Calendar className="h-5 w-5 text-brand" /> Seasonal Picks
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Shop what's in season now
          </p>
        </div>
        <Link to="/browse" className="text-sm font-semibold text-brand hover:underline">
          See all seasonal
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:gap-6">
        {picks.map((pick) => (
          <ProductCard key={pick.id} pick={pick} />
        ))}
      </div>
    </div>
  );
}

function ProductCard({ pick }: { pick: SeasonalPick }) {
  return (
    <Link to={`/listing/${pick.id}`} className="group block">
      <div className="rounded-2xl border border-border bg-background overflow-hidden hover:shadow-lg transition-all duration-300 group-hover:border-brand/50">
        <div className="relative">
          <img
            src={pick.images?.[0] ?? ""}
            alt={pick.title}
            className="h-48 w-full object-cover"
          />
          {/* Seasonal tag */}
          <div className="absolute top-2 left-2 bg-brand text-white text-xs font-bold px-2 py-1 rounded">
            {getSeasonalLabel()}
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
          <h3 className="text-lg font-black line-clamp 2">{pick.title}</h3>
          <p className="mt-2 text-sm text-foreground/60">
            {pick.brand} · {pick.size} · {pick.condition}
          </p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm font-medium text-brand">
              {pick.value} credits
            </span>
            <div className="flex items-center gap-1 text-xs text-foreground/50">
              <span className="text-xs">👁️</span>
              <span>{pick.views?.toLocaleString() ?? "0"}</span>
              <span className="mx-2">•</span>
              <span className="text-xs">💾</span>
              <span>{pick.saves?.toLocaleString() ?? "0"}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function getSeasonalLabel(): string {
  const month = new Date().getMonth();
  if (month === 11 || month <= 1) return "Winter";
  if (month >= 2 && month <= 4) return "Spring";
  if (month >= 5 && month <= 7) return "Summer";
  return "Fall";
}

function ProductSkeleton() {
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