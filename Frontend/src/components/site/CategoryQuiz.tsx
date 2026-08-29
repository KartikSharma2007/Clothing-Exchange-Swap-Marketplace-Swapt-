import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import halter from "@/assets/style-halter.jpg";
import shirt from "@/assets/style-shirt.jpg";
import shorts from "@/assets/pop-shorts.jpg";
import backpack from "@/assets/pop-backpack.jpg";

const base = { q: "", cat: "", size: "", g: "", brand: "", tag: "", sort: "newest" };

const cats = [
  { label: "Womenswear", sub: "Dresses, tops & more", img: halter, search: { ...base, g: "Womens" } },
  { label: "Menswear", sub: "Streetwear & staples", img: shirt, search: { ...base, g: "Mens" } },
  { label: "Kids", sub: "Grows-with-them finds", img: shorts, search: { ...base, g: "Kids" } },
  { label: "Everything", sub: "Browse the whole swap", img: backpack, search: base },
];

export function CategoryQuiz() {
  return (
    <section className="bg-surface-cream">
      <div className="mx-auto max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black tracking-tight md:text-3xl">What category do you swap in?</h2>
            <p className="mt-1.5 text-sm text-foreground/60">
              Pick a department — we&apos;ll show you the best swaps in it.
            </p>
          </div>
          <span className="hidden rounded-full border border-foreground/10 bg-background/70 px-3.5 py-2.5 text-sm min-h-11 font-bold text-foreground/70 sm:inline-flex">
            Four ways to browse
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {cats.map((c) => (
            <Link
              key={c.label}
              to="/browse"
              search={c.search}
              className="group relative aspect-[4/5] overflow-hidden rounded-2xl shadow-sm ring-1 ring-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
            >
              <img
                src={c.img}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <p className="text-base font-black tracking-tight text-white">{c.label}</p>
                <p className="mt-0.5 text-xs text-white/70">{c.sub}</p>
              </div>
              <span className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/20 text-white backdrop-blur transition-all duration-300 group-hover:bg-white group-hover:text-foreground">
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}