import type { ReactNode } from "react";

/**
 * Consistent section heading used across the home page: brand eyebrow bar,
 * black title, optional subtitle and a right-aligned action link.
 */
export function SectionHeader({
  eyebrow = "Swapt",
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-brand">
          <span className="h-4 w-1 rounded-full bg-brand" /> {eyebrow}
        </p>
        <h2 className="mt-1.5 text-2xl font-black tracking-tight md:text-3xl">{title}</h2>
        {subtitle && <p className="mt-1.5 text-sm text-foreground/60">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}