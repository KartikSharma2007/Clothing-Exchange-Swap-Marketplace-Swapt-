import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Reusable avatar — shows the profile photo when set, otherwise falls back to
 * the person's initials on a brand tint. Rounded by default; pass a className
 * like "rounded-3xl" to override (tailwind-merge keeps the last radius).
 */
export function Avatar({
  url,
  name,
  size = 40,
  className = "",
  onClick,
}: {
  url?: string | null;
  name?: string;
  size?: number;
  className?: string;
  onClick?: () => void;
}) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const [imgErrored, setImgErrored] = React.useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
      "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-foreground/70 ring-1 ring-border transition leading-none",
        onClick ? "cursor-pointer" : "",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {url && !imgErrored ? (
        <img
          src={url}
          alt={name || "avatar"}
          className="h-full w-full object-cover block"
          referrerPolicy="no-referrer"
          onError={() => setImgErrored(true)}
        />
      ) : (
        <span className="font-black leading-none">{initials}</span>
      )}
    </button>
  );
}
