import { Link } from "@tanstack/react-router";
import shorts from "@/assets/pop-shorts.jpg";
import hoodie from "@/assets/pop-hoodie.jpg";
import backpack from "@/assets/pop-backpack.jpg";
import sneakers from "@/assets/pop-sneakers.jpg";
import { ProductCard } from "./ProductCard";
import { SectionHeader } from "./SectionHeader";

const items = [
  { image: shorts, title: "Vintage floral shorts", meta: "+3k searches", query: "shorts" },
  { image: hoodie, title: "Zip up hoodie Y2K", meta: "+1.5k searches", query: "hoodie" },
  { image: backpack, title: "Metallic backpack", meta: "+10k searches", query: "backpack" },
  { image: sneakers, title: "Pearlized slip-ons", meta: "+2.2k searches", query: "sneaker" },
];

export function PopularWeek() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-10 md:px-8 md:pb-14">
      <SectionHeader
        title="Popular this week"
        subtitle="The pieces everyone's searching for right now."
        action={
          <Link
            to="/browse"
            search={{ q: "", cat: "", size: "", g: "", brand: "", tag: "trending", sort: "newest" }}
            className="inline-flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-foreground"
          >
            See all trending <span aria-hidden>→</span>
          </Link>
        }
      />
      <div className="relative">
        <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none md:mx-0 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible md:px-0 md:pb-0">
          {items.map((i) => (
            <div key={i.title} className="min-w-[72%] snap-start sm:min-w-[46%] md:min-w-0">
              <ProductCard image={i.image} title={i.title} meta={i.meta} query={i.query} tag="trending" />
            </div>
          ))}
        </div>
        {/* Mobile fade hint + scroll dots so users know to swipe */}
        <div className="pointer-events-none absolute right-0 top-0 hidden h-full w-12 bg-gradient-to-l from-background to-transparent max-md:block md:hidden" aria-hidden />
      </div>
      <div className="mt-3 flex justify-center gap-1.5 md:hidden" aria-hidden>
        <span className="h-1.5 w-5 rounded-full bg-foreground" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
        <span className="h-1.5 w-1.5 rounded-full bg-foreground/20" />
      </div>
    </section>
  );
}