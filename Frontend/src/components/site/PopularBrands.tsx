import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import cargo from "@/assets/style-cargo.jpg";
import shirt from "@/assets/style-shirt.jpg";
import halter from "@/assets/style-halter.jpg";
import shorts from "@/assets/pop-shorts.jpg";
import sneakers from "@/assets/pop-sneakers.jpg";
import backpack from "@/assets/pop-backpack.jpg";
import hoodie from "@/assets/pop-hoodie.jpg";
import { SectionHeader } from "./SectionHeader";
import { fetchFacets } from "@/lib/listings-api";

const fallbackBrands = [
  { name: "Levi's", imgs: [cargo, shirt, halter, shorts] },
  { name: "Nike", imgs: [hoodie, backpack, sneakers, shirt] },
  { name: "Zara", imgs: [halter, shorts, cargo, sneakers] },
];

const brandImages: Record<string, string[]> = {
  "Levi's": [cargo, shirt, halter, shorts],
  "Nike": [hoodie, backpack, sneakers, shirt],
  "Zara": [halter, shorts, cargo, sneakers],
  "H&M": [halter, shorts, cargo, hoodie],
  "Patagonia": [halter, shorts, cargo, sneakers],
  "The North Face": [hoodie, backpack, sneakers, shirt],
};

function brandImgs(name: string): string[] {
  return brandImages[name] ?? [cargo, shirt, halter, shorts];
}

export function PopularBrands() {
  const { data } = useQuery({ queryKey: ["facets-brands"], queryFn: fetchFacets });
  const top = (data?.brands ?? []).slice(0, 3);
  const brands = top.length >= 2 ? top.map((b) => ({ name: b.value, imgs: brandImgs(b.value) })) : fallbackBrands;
  return (
    <section className="mx-auto max-w-[1400px] px-4 pb-10 md:px-8 md:pb-14">
      <SectionHeader title="Popular brands" subtitle="Shop the labels everyone's swapping right now — live from the catalog." />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {brands.map((b) => (
          <Link
            key={b.name}
            to="/browse"
            search={{ q: "", cat: "", size: "", g: "", brand: b.name, tag: "", sort: "newest" }}
            className="group rounded-2xl border border-border bg-card p-3 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="grid aspect-[4/1] grid-cols-4 gap-0.5 overflow-hidden rounded-xl">
              {b.imgs.map((src, i) => (
                <div key={i} className="overflow-hidden">
                  <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between px-1">
              <span className="text-sm font-black tracking-tight">{b.name}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-2 text-sm min-h-9 font-bold text-background opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                Shop <ArrowRight className="h-3 w-3" />
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}