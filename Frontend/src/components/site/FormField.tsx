import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const fieldInput =
  "w-full bg-transparent text-sm outline-none placeholder:text-foreground/35 disabled:opacity-60 max-md:text-[16px] max-md:placeholder:text-sm";

/** Small caps section heading used to group a form into logical blocks. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="pt-1 text-xs font-bold uppercase tracking-[0.18em] text-foreground/40">
      {children}
    </p>
  );
}

/**
 * Premium field: label + a filled, rounded input container with a leading
 * icon that lights up in the accent colour when focused. Shared by the auth
 * pages and the sell form.
 */
export function FormField({
  label,
  icon,
  children,
  error,
  hint,
  trailing,
  multiline = false,
  tone = "brand",
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
  error?: string;
  hint?: string;
  trailing?: ReactNode;
  multiline?: boolean;
  /** "brand" (signature red) or "violet" (used on the login canvas). */
  tone?: "brand" | "violet";
}) {
  const accent =
    tone === "violet"
      ? "focus-within:border-[#8b7cf6]/70 focus-within:ring-[#8b7cf6]/15 group-focus-within:text-[#8b7cf6]"
      : "focus-within:border-brand/60 focus-within:ring-brand/10 group-focus-within:text-brand";
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-foreground/50">{label}</span>
        {trailing}
      </div>
      <div
        className={cn(
          "group relative flex rounded-2xl border bg-muted/40 px-3.5 py-3 transition-all duration-200 max-md:rounded-2xl max-md:px-4 max-md:py-3.5",
          "focus-within:bg-background focus-within:shadow-sm focus-within:ring-4",
          multiline ? "items-start" : "items-center",
          accent,
          error
            ? "border-destructive/60 bg-destructive/[0.04] focus-within:border-destructive/60 focus-within:ring-destructive/10"
            : "border-border",
        )}
      >
        {icon && (
          <span
            className={cn(
              "pointer-events-none shrink-0 text-foreground/40 transition-colors duration-200",
              multiline && "mt-0.5",
              accent,
            )}
          >
            {icon}
          </span>
        )}
        {children}
      </div>
      {hint && !error && <p className="mt-1.5 text-xs text-foreground/50">{hint}</p>}
      {error && <p className="mt-1.5 animate-fade-in text-xs text-destructive">{error}</p>}
    </div>
  );
}