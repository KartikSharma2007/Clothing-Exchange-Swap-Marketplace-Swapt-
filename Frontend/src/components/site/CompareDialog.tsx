import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import type { ApiListing } from "@/lib/listings-api";
import { useModalDialog } from "@/lib/dialog-a11y";

type Props = {
  open: boolean;
  items: ApiListing[];
  onClose: () => void;
  onRemove: (id: string) => void;
};

const ROWS: { label: string; get: (l: ApiListing) => string }[] = [
  { label: "Brand", get: (l) => l.brand },
  { label: "Category", get: (l) => l.category },
  { label: "Size", get: (l) => l.size },
  { label: "Condition", get: (l) => l.condition },
  { label: "Colour", get: (l) => l.color },
  { label: "Swap value", get: (l) => `${l.value} credits` },
  { label: "Retail value", get: (l) => (l.retailValue ? `${l.retailValue}` : "—") },
  { label: "Material", get: (l) => l.material || "—" },
  { label: "Fit", get: (l) => l.fit || "—" },
  { label: "Style", get: (l) => l.style || "—" },
  { label: "Pattern", get: (l) => l.pattern || "—" },
  { label: "Season", get: (l) => l.season || "—" },
  { label: "Seller rating", get: (l) => (l.seller?.username ? `${Number(l.seller.rating ?? 0).toFixed(1)} ★` : "—") },
  { label: "Views", get: (l) => String(l.views ?? 0) },
  { label: "Saved", get: (l) => String(l.saves ?? 0) },
  { label: "Location", get: (l) => l.location || "—" },
  { label: "Ships from", get: (l) => l.shipsFrom || l.location || "—" },
  { label: "Local meetup", get: (l) => (l.meetup ? "Yes" : "No") },
  { label: "Shipping", get: (l) => l.shippingDays || "—" },
  { label: "Tags", get: (l) => (l.tags?.length ? l.tags.join(", ") : "—") },
];

/** Side-by-side attribute table for up to 4 saved compare items. */
export default function CompareDialog({ open, items, onClose, onRemove }: Props) {
  const dialogRef = useModalDialog(open, onClose);
  if (!open) return null;
  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/70 p-3 pt-8 outline-none sm:p-6 sm:pt-12"
      role="dialog"
      aria-modal="true"
      aria-label={`Compare ${items.length} item${items.length === 1 ? "" : "s"}`}
    >
      <div className="w-full max-w-5xl rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-black sm:text-lg">Compare {items.length} item{items.length === 1 ? "" : "s"}</h3>
          <button onClick={onClose} aria-label="Close compare" className="rounded-full p-2 text-neutral-500 transition-colors hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            Add items to compare with the compare button on each listing card.
          </p>
        ) : (
          <div className="grid gap-x-3 gap-y-3 overflow-x-auto pb-1" style={{ gridTemplateColumns: `minmax(90px, 130px) repeat(${items.length}, minmax(0, 1fr))` }}>
            <div />
            {items.map((l) => (
              <div key={l.id} className="relative">
                <Link to="/listing/$id" params={{ id: l.id }} className="block">
                  <img src={l.images[0]} alt={l.title} className="aspect-[3/4] w-full rounded-xl border border-border object-cover" />
                </Link>
                <button
                  onClick={() => onRemove(l.id)}
                  aria-label={`Remove ${l.title}`}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition-colors hover:bg-rose-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <Link to="/listing/$id" params={{ id: l.id }} className="mt-1.5 block text-xs font-bold leading-tight text-neutral-800 hover:text-brand">
                  {l.title}
                </Link>
              </div>
            ))}

            {ROWS.map((row) => (
              <CompareRow key={row.label} label={row.label} items={items} get={row.get} />
            ))}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="rounded-xl bg-black px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-neutral-800">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function CompareRow({ label, items, get }: { label: string; items: ApiListing[]; get: (l: ApiListing) => string }) {
  return (
    <>
      <div className="self-start pt-0.5 text-xs font-bold uppercase tracking-wide text-neutral-400">{label}</div>
      {items.map((l) => (
        <div key={l.id} className="break-words text-xs font-medium text-neutral-700">
          {get(l)}
        </div>
      ))}
    </>
  );
}