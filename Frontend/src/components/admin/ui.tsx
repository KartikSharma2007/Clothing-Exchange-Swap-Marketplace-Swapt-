import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-background p-4 md:p-5 ${className}`}>{children}</section>;
}

export function Stat({ label, value, hint, tone = "default" }: {
  label: string; value: string | number | undefined; hint?: string; tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const tones = {
    default: "text-foreground",
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
    info: "text-indigo-600",
  } as const;
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{label}</p>
      <p className={`mt-1 text-2xl font-black tracking-tight ${tones[tone]}`}>
        {typeof value === "number" ? value.toLocaleString() : (value ?? "—")}
      </p>
      {hint && <p className="mt-0.5 text-xs text-foreground/50">{hint}</p>}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-2">{children}</div>;
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 min-w-[220px] flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-foreground/40"
    />
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-full border px-3 py-2 text-sm min-h-9 font-semibold capitalize transition-colors ${
            value === option ? "border-foreground bg-foreground text-background" : "border-border text-foreground/65 hover:text-foreground"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function Btn({ children, onClick, variant = "ghost", disabled, type = "button", className = "" }: {
  children: ReactNode; onClick?: () => void; variant?: "solid" | "ghost" | "danger"; disabled?: boolean;
  type?: "button" | "submit"; className?: string;
}) {
  const variants = {
    solid: "bg-foreground text-background hover:bg-foreground/85",
    ghost: "border border-border text-foreground hover:bg-muted",
    danger: "border border-red-300 text-red-600 hover:bg-red-50",
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2.5 text-sm min-h-11 font-semibold transition-colors disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  const tones = {
    neutral: "bg-muted text-foreground/70",
    good: "bg-emerald-100 text-emerald-800",
    warn: "bg-amber-100 text-amber-800",
    bad: "bg-red-100 text-red-700",
    info: "bg-indigo-100 text-indigo-800",
  } as const;
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold capitalize ${tones[tone]}`}>{children}</span>;
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-background">
      <table className="admin-table w-full text-left text-sm md:min-w-[720px]">
        <thead className="border-b border-border bg-muted/40">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-foreground/50">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border md:divide-y">{children}</tbody>
      </table>
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg animate-in overflow-y-auto rounded-t-2xl border border-border bg-background p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-black tracking-tight">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-foreground/55">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40";

export function Empty({ label }: { label: string }) {
  return <p className="rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-foreground/50">{label}</p>;
}

export function Pagination({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-2 text-sm">
      <span className="text-xs text-foreground/55">
        Page {page} of {pages}
      </span>
      <div className="flex items-center gap-1">
        <Btn onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1}>
          ← Prev
        </Btn>
        {pages <= 7 ? (
          Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`h-8 min-w-8 rounded-md px-2 text-xs font-semibold transition-colors ${
                p === page ? "bg-foreground text-background" : "text-foreground/60 hover:bg-muted hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))
        ) : (
          <span className="px-2 text-xs font-semibold text-foreground/50">{page} / {pages}</span>
        )}
        <Btn onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages}>
          Next →
        </Btn>
      </div>
    </div>
  );
}

export function statusTone(status: string): "neutral" | "good" | "warn" | "bad" | "info" {
  if (["active", "approved", "completed", "resolved", "verified"].includes(status)) return "good";
  if (["pending", "reviewing", "hidden", "suspended"].includes(status)) return "warn";
  if (["banned", "rejected", "deleted", "disputed", "cancelled", "open"].includes(status)) return "bad";
  if (["accepted", "archived", "featured"].includes(status)) return "info";
  return "neutral";
}