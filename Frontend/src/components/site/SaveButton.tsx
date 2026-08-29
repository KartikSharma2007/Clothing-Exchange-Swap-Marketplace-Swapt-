import { Heart } from "lucide-react";
import { useState } from "react";
import { useWishlist, type BagItem } from "@/lib/wishlist";
import { cn } from "@/lib/utils";

type Props = {
  item: Omit<BagItem, "addedAt">;
  /** "icon" = floating circle on a card, "pill" = labelled button */
  variant?: "icon" | "pill" | "bare";
  className?: string;
};

/**
 * The single Like control used everywhere. Clicking it saves the listing into
 * the user's Bag (wishlist), de-duplicated, with an animated toast.
 */
export function SaveButton({ item, variant = "icon", className }: Props) {
  const { has, toggle } = useWishlist();
  const saved = has(item.listingId);
  const [busy, setBusy] = useState(false);

  const onClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await toggle(item);
    } finally {
      setBusy(false);
    }
  };

  const label = saved ? `Remove ${item.title} from your Bag` : `Save ${item.title} to your Bag`;
  const icon = (
    <Heart
      className={cn(
        "transition-all duration-200",
        variant === "pill" ? "h-4 w-4" : "h-4 w-4",
        saved ? "scale-110 fill-brand text-brand" : "",
      )}
    />
  );

  if (variant === "pill") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={label}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
          saved ? "border-brand text-brand" : "border-border hover:border-foreground",
          className,
        )}
      >
        {icon}
        {saved ? "In your Bag" : "Save to Bag"}
      </button>
    );
  }

  if (variant === "bare") {
    return (
      <button type="button" onClick={onClick} aria-pressed={saved} aria-label={label} className={className}>
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={label}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-transform hover:scale-110 active:scale-95",
        className,
      )}
    >
      {icon}
    </button>
  );
}
