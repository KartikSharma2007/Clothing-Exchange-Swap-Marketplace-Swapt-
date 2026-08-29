import { Link } from "@tanstack/react-router";
import cargo from "@/assets/style-cargo.jpg";
import shirt from "@/assets/style-shirt.jpg";
import halter from "@/assets/style-halter.jpg";
import shorts from "@/assets/pop-shorts.jpg";
import sneakers from "@/assets/pop-sneakers.jpg";
import backpack from "@/assets/pop-backpack.jpg";
import { ProductCard } from "./ProductCard";
import { SectionHeader } from "./SectionHeader";

const styles = [
  { image: cargo, title: "Summer cargo", query: "cargo" },
  { image: shirt, title: "Seaside staples", query: "shirt" },
  { image: halter, title: "Summer nights", query: "halter" },
  { image: backpack, title: "Shine on", query: "backpack" },
  { image: sneakers, title: "Wear on repeat", query: "sneaker" },
  { image: shorts, title: "Hibiscus print", query: "shorts" },
];

export function StyleGrid() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-10 md:px-8 md:py-14">
      <SectionHeader
        title="Swap by style"
        subtitle="Fresh-out-the-closet looks, hand-picked for warm weather."
        action={
          <Link
            to="/browse"
            search={{ q: "", cat: "", size: "", g: "", brand: "", tag: "", sort: "newest" }}
            className="inline-flex items-center gap-1 text-sm font-bold text-brand transition-colors hover:text-foreground"
          >
            View all <span aria-hidden>→</span>
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 md:gap-6">
        {styles.map((s) => (
          <ProductCard key={s.title} image={s.image} title={s.title} query={s.query} />
        ))}
      </div>
    </section>
  );
}