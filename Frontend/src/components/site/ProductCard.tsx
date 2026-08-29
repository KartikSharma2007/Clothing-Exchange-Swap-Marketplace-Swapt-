import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

interface Props {
  image: string;
  title: string;
  meta?: string;
  /** Search text the tile drops into the browse page. */
  query?: string;
  /** Optional collection tag (e.g. "trending"). */
  tag?: string;
}

export function ProductCard({ image, title, meta, query, tag }: Props) {
  return (
    <Link
      to="/browse"
      search={{ q: query ?? "", cat: "", size: "", g: "", brand: "", tag: tag ?? "", sort: "newest" }}
      className="group block"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted shadow-sm ring-1 ring-black/5 transition-all duration-300 group-hover:shadow-xl active:scale-[0.98] max-md:active:scale-[0.98]">
        <img
          src={image}
          alt={title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05] group-active:scale-[1.02]"
        />
        <span className="absolute right-2.5 top-2.5 grid h-8 w-8 translate-y-1 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm backdrop-blur transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100 max-md:translate-y-0 max-md:opacity-100 max-md:h-9 max-md:w-9">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2.5 px-0.5">
        <p className="truncate text-sm font-bold transition-colors group-hover:text-brand">{title}</p>
        {meta && <p className="mt-0.5 text-xs text-foreground/60">{meta}</p>}
      </div>
    </Link>
  );
}