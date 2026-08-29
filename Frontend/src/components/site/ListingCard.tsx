import { Link } from "@tanstack/react-router";
import { Coins, MapPin, PackageX, Ruler, Star } from "lucide-react";
import { SaveButton } from "@/components/site/SaveButton";
import { isDemoSold } from "@/lib/sold";
import type { ApiListing } from "@/lib/listings-api";

type Props = {
  listing: ApiListing;
  /** Optional one-line reason this item was recommended. */
  matchLabel?: string;
};

/**
 * Data-driven listing card used in recommendation rows and grids.
 * Mirrors the markup on the browse page.
 */
export function ListingCard({ listing: l, matchLabel }: Props) {
  const sold = l.status === "swapped" || l.status === "hidden" || isDemoSold(l.id);
  return (
    <Link to="/listing/$id" params={{ id: l.id }} className="group block">
      <div className="relative aspect-square overflow-hidden rounded-[1.25rem] bg-muted shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover:shadow-xl sm:rounded-2xl">
        <img
          src={l.images[0]} alt={l.title} loading="lazy"
          className={`h-full w-full object-cover transition-transform duration-500 ease-out ${sold ? "saturate-50" : "group-hover:scale-[1.05]"}`}
        />
        {sold && (
          <div className="absolute inset-0 grid place-items-center bg-foreground/40 backdrop-blur-[1px]">
            <span className="flex items-center gap-1.5 rounded-full bg-background/95 px-3 py-2.5 text-sm min-h-11 font-black uppercase tracking-widest text-foreground shadow">
              <PackageX className="h-3.5 w-3.5 text-rose-500" /> Swapped
            </span>
          </div>
        )}
        <SaveButton
          className="absolute right-2 top-2 opacity-100 md:opacity-0 transition-opacity md:group-hover:opacity-100 md:focus-visible:opacity-100"
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
        />
        {l.likelyFit && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600/90 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white backdrop-blur">
            <Ruler className="h-3 w-3" /> Fits you
          </span>
        )}
        {l.meetup && (
          <span className="absolute bottom-2 left-2 rounded-full bg-emerald-600/90 px-2.5 py-2 text-sm min-h-9 font-bold uppercase tracking-wide text-white backdrop-blur">
            Meetup
          </span>
        )}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-2 text-sm min-h-9 font-black text-foreground shadow-sm backdrop-blur">
          <Coins className="h-3 w-3 text-brand" /> {l.value}
        </span>
      </div>
      <div className="mt-2.5 px-0.5">
        <p className="truncate text-sm font-bold transition-colors group-hover:text-brand">{l.title}</p>
        <p className="mt-0.5 truncate text-xs text-foreground/60">{l.brand} · Size {l.size}</p>
        {l.seller?.username && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-foreground/55">
            <Star className="h-3 w-3 fill-current text-amber-400" />
            {Number(l.seller.rating ?? 0).toFixed(1)}
            <span className="truncate text-foreground/45">· {l.seller.name}</span>
          </p>
        )}
        {matchLabel ? (
          <p className="mt-1 text-xs font-semibold text-brand">{matchLabel}</p>
        ) : l.distanceKm != null ? (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-brand">
            <MapPin className="h-3 w-3" /> {l.distanceKm} km away
          </p>
        ) : null}
      </div>
    </Link>
  );
}