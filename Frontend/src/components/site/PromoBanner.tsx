import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import backpack from "@/assets/pop-backpack.jpg";
import { emptySearch } from "@/lib/taxonomy";

export function PromoBanner() {
  return (
    <section className="mx-auto max-w-[1400px] px-4 pt-4 md:px-8 md:pt-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#b01f24] via-brand to-[#e04a50] shadow-xl shadow-brand/25">
        {/* Decorative rings */}
        <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full border-[18px] border-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-28 h-52 w-52 rounded-full border-[14px] border-white/10" />

        <div className="relative grid items-center gap-6 p-8 md:grid-cols-[minmax(0,1fr)_220px] md:p-10">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-white/70">Limited drop · new this week</p>
            <h3 className="mt-2 max-w-md text-2xl font-black leading-tight text-white md:text-3xl">
              Backpacks under 25 credits
            </h3>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-white/75">
              Spend less on a bag that fits more — grab a pick before it gets swapped.
            </p>
            <Link
              to="/browse"
              search={{ ...emptySearch, q: "backpack", cat: "Bags" }}
              className="group mt-5 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-brand shadow-lg transition-transform duration-200 hover:scale-[1.03]"
            >
              Shop backpacks
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
          <div className="hidden md:block">
            <div className="mx-auto aspect-[3/4] max-w-[200px] overflow-hidden rounded-2xl shadow-2xl ring-4 ring-white/20 transition-transform duration-300 hover:scale-[1.02]">
              <img src={backpack} alt="Metallic backpack" className="h-full w-full object-cover" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}