import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Shapes } from "lucide-react";
import { fetchRecentSwaps, type RecentSwap } from "@/lib/recent-swaps-api";

export function RecentSwaps() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["recent-swaps"],
    queryFn: () => fetchRecentSwaps(6),
  });

  const swaps = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div>
        <h2 className="mb-6 flex items-center gap-2 text-2xl font-black tracking-tight"></h2>
          <Shapes className="h-5 w-5 text-brand" /> Recently Completed Swaps
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="grid grid-cols-2 gap-4">
                <div className="aspect-[16/9] rounded-2xl bg-muted" />
                <div className="space-y-3">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="h-3 w-1/2 rounded bg-muted" />
                  <div className="h-2 w-1/3 rounded bg-muted" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-foreground/60">
          Couldn't load recent swaps. Try again later.
        </div>
      </div>
    );
  }

  if (swaps.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-foreground/60">
          No recent swaps yet. Be the first to start swapping!
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-12 md:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight">
            <Shapes className="h-5 w-5 text-brand" /> Recently Completed Swaps
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            See what other Swapt members are exchanging
          </p>
        </div>
        <Link to="/browse" className="text-sm font-semibold text-brand hover:underline">
          Browse all swaps
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {swaps.map((swap) => (
          <SwapItem key={swap.id} swap={swap} />
        ))}
      </div>
    </div>
  );
}

function SwapItem({ swap }: { swap: RecentSwap }) {
  const formatDate = (dateString: string) => {
    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  return (
    <Link to="/browse" className="group block">
      <div className="rounded-2xl border border-border bg-background shadow-sm hover:shadow-lg transition-all duration-300">
        <div className="grid grid-cols-2 gap-4 p-5">
          {/* Left side: Items swapped */}
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              {/* Item 1 */}
              <div className="flex-1">
                <div className="aspect-[3/4] w-full rounded-2xl border border-border overflow-hidden">
                  {swap.requestedListing?.images?.[0] ? (
                    <img
                      src={swap.requestedListing.images[0]}
                      alt={`${swap.requestedListing.title} ${swap.requestedListing.brand}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-muted flex items-center justify-center">
                      <span className="text-xs text-foreground/50">No image</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-sm font-medium line-clamp 1">{swap.requestedListing?.title ?? 'Item'}</p>
                  <p className="text-xs text-foreground/60">
                    {swap.requestedListing?.brand} · {swap.requestedListing?.size}
                  </p>
                </div>
              </div>

              {/* Arrow */}
              <div className="flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-brand" />
                <span className="text-xs text-foreground/50">swapped for</span>
              </div>

              {/* Item 2 */}
              <div className="flex-1">
                <div className="aspect-[3/4] w-full rounded-2xl border border-border overflow-hidden">
                  {swap.offeredListing?.images?.[0] ? (
                    <img
                      src={swap.offeredListing.images[0]}
                      alt={`${swap.offeredListing.title} ${swap.offeredListing.brand}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full bg-muted flex items-center justify-center">
                      <span className="text-xs text-foreground/50">No image</span>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-sm font-medium line-clamp 1">{swap.offeredListing?.title ?? 'Item'}</p>
                  <p className="text-xs text-foreground/60">
                    {swap.offeredListing?.brand} · {swap.offeredListing?.size}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right side: Swap info */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-foreground/50">
              Completed {formatDate(swap.completedAt !== null ? swap.completedAt : new Date().toISOString())}
            </p>
            {swap.message && (
              <p className="text-sm text-foreground/60 line-clamp 2">
                "{swap.message}"
              </p>
            )}
            <div className="flex items-center gap-2 text-xs text-foreground/50">
              <span className="flex items-center gap-1">
                {/* Simplified impact - in reality this would be calculated */ }
                <span className="text-xs font-medium">~1.8kg</span>
                <span className="text-xs">waste saved</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}