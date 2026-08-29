import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Ruler } from "lucide-react";
import { fieldInput } from "@/components/site/FormField";
import { cn } from "@/lib/utils";

/* ── Design tokens (kept local, from the flat-lay diagram design) ── */
const GARMENT_FILL = "#eef0f4";
const GARMENT_STROKE = "#c7cbd4";
const PALETTE = ["#d9542f", "#2f6f5e", "#3a5ba0", "#a3762b"]; // 1..4, shared across all three diagrams
const FONT = "'Inter', ui-sans-serif, system-ui, sans-serif";

const CM_PER_INCH = 2.54;

/* ── Measurement metadata for the input fields ── */
const MEASURE_META: Record<string, { label: string; tip: string; placeholder: string }> = {
  chest: { label: "Chest", tip: "Across the garment, just under the armpits.", placeholder: "108" },
  waist: { label: "Waist", tip: "Across the waistband, laid flat.", placeholder: "82" },
  hips: { label: "Hips", tip: "At the widest point of the hips.", placeholder: "104" },
  length: { label: "Length", tip: "Shoulder seam to bottom hem.", placeholder: "68" },
  inseam: { label: "Inseam", tip: "Inside the leg — crotch to hem.", placeholder: "78" },
  shoulder: { label: "Shoulder", tip: "Between the shoulder seams.", placeholder: "46" },
  sleeve: { label: "Sleeve", tip: "Shoulder seam to the end of the cuff.", placeholder: "62" },
};

const FULL = Object.keys(MEASURE_META);

const GROUP_MEASURES: Record<string, string[]> = {
  tops: ["chest", "length", "shoulder", "sleeve"],
  bottoms: ["waist", "hips", "inseam", "length"],
  dress: ["chest", "waist", "hips", "length"],
  outerwear: ["chest", "length", "shoulder", "sleeve"],
};

const CATEGORY_MEASURE_GROUP: Record<string, keyof typeof GROUP_MEASURES | "none"> = {
  "T-shirts": "tops",
  "Shirts & Blouses": "tops",
  Tops: "tops",
  "Knitwear & Jumpers": "tops",
  "Hoodies & Sweatshirts": "tops",
  Dresses: "dress",
  Skirts: "bottoms",
  Jeans: "bottoms",
  Trousers: "bottoms",
  Shorts: "bottoms",
  Bottoms: "bottoms",
  "Jackets & Coats": "outerwear",
  Outerwear: "outerwear",
  "Blazers & Suits": "outerwear",
  Activewear: "full",
  Swimwear: "full",
  "Loungewear & Sleepwear": "tops",
  Vintage: "full",
  Shoes: "none",
  Sneakers: "none",
  Boots: "none",
  Bags: "none",
  Accessories: "none",
  Jewellery: "none",
  "Hats & Caps": "none",
  Sunglasses: "none",
  Watches: "none",
};

export function measureGroupFor(category: string): keyof typeof GROUP_MEASURES | "none" | "full" {
  return CATEGORY_MEASURE_GROUP[category] ?? "full";
}

/** The measurements that actually matter for a given category. */
export function recommendedFor(category: string): string[] {
  const g = measureGroupFor(category);
  return g === "none" ? [] : GROUP_MEASURES[g] ?? FULL;
}

/* ── Garment diagrams: paths + measurement lines ── */
type LineDef = {
  n: number;
  field: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  desc: string;
  labelPos?: [number, number];
};

const TOPS_LINES: LineDef[] = [
  { n: 1, field: "shoulder", x1: 48, y1: 58, x2: 152, y2: 58, label: "Shoulder", desc: "between the seams" },
  { n: 2, field: "chest", x1: 53, y1: 101, x2: 147, y2: 101, label: "Chest", desc: "under the armpits" },
  { n: 3, field: "sleeve", x1: 46, y1: 57, x2: 22, y2: 85, label: "Sleeve", desc: "seam to cuff", labelPos: [24, 66] },
  { n: 4, field: "length", x1: 100, y1: 46, x2: 100, y2: 212, label: "Length", desc: "seam to hem", labelPos: [100, 150] },
];

const BOTTOMS_LINES: LineDef[] = [
  { n: 1, field: "waist", x1: 76, y1: 22, x2: 124, y2: 22, label: "Waist", desc: "across the waistband" },
  { n: 2, field: "hips", x1: 65, y1: 59, x2: 135, y2: 59, label: "Hips", desc: "widest point" },
  { n: 3, field: "inseam", x1: 101, y1: 124, x2: 111, y2: 210, label: "Inseam", desc: "crotch to hem" },
  { n: 4, field: "length", x1: 63, y1: 60, x2: 60, y2: 210, label: "Length", desc: "side", labelPos: [40, 135] },
];

const DRESS_LINES: LineDef[] = [
  { n: 1, field: "chest", x1: 76, y1: 63, x2: 124, y2: 63, label: "Chest", desc: "under the armpits" },
  { n: 2, field: "waist", x1: 71, y1: 122, x2: 129, y2: 122, label: "Waist", desc: "natural waist" },
  { n: 3, field: "hips", x1: 60, y1: 172, x2: 140, y2: 172, label: "Hips", desc: "widest point" },
  { n: 4, field: "length", x1: 100, y1: 46, x2: 100, y2: 220, label: "Length", desc: "seam to hem", labelPos: [100, 150] },
];

type GuideKey = "tops" | "bottoms" | "dress";

const LINES_BY_KIND: Record<GuideKey, LineDef[]> = { tops: TOPS_LINES, bottoms: BOTTOMS_LINES, dress: DRESS_LINES };

const GARMENTS: { key: GuideKey; eyebrow: string; path: string; lines: LineDef[] }[] = [
  {
    key: "tops",
    eyebrow: "Tops",
    path: "M100,32 C93,32 86,37 82,46 L46,57 L21,86 L46,101 L51,214 Q100,226 149,214 L154,101 L179,86 L154,57 L118,46 C114,37 107,32 100,32 Z",
    lines: TOPS_LINES,
  },
  {
    key: "bottoms",
    eyebrow: "Bottoms",
    path: "M74,20 L126,20 L136,58 Q138,80 141,213 L114,213 L100,122 L86,213 L59,213 Q62,80 64,58 Z",
    lines: BOTTOMS_LINES,
  },
  {
    key: "dress",
    eyebrow: "Dress",
    path: "M86,20 L114,20 L119,29 L122,46 Q134,120 146,224 L54,224 Q66,120 78,46 L81,29 Z",
    lines: DRESS_LINES,
  },
];

/** Fallback badge lookup so any field still gets a number/colour. */
const FIELD_BADGE: Record<string, { num: number; color: string }> = {};
for (const lines of [TOPS_LINES, BOTTOMS_LINES, DRESS_LINES]) {
  for (const l of lines) {
    if (!FIELD_BADGE[l.field]) FIELD_BADGE[l.field] = { num: l.n, color: PALETTE[l.n - 1] };
  }
}

function badgeFor(field: string, kind: GuideKey): { num: number; color: string } {
  const hit = LINES_BY_KIND[kind].find((l) => l.field === field);
  return hit ? { num: hit.n, color: PALETTE[hit.n - 1] } : FIELD_BADGE[field] ?? { num: 0, color: PALETTE[0] };
}

function cmToDisplay(value: string, unit: "cm" | "in"): string {
  if (!value.trim()) return "";
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  if (unit === "cm") return String(Math.round(n * 10) / 10);
  return String(Math.round((n / CM_PER_INCH) * 10) / 10);
}

function displayToCm(value: string, unit: "cm" | "in"): string {
  if (!value.trim()) return "";
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return value;
  if (unit === "cm") return String(Math.round(n * 10) / 10);
  return String(Math.round(n * CM_PER_INCH));
}

/* ── Dimension-line primitive: labelled span with end dots ── */
function DimLine({ x1, y1, x2, y2, n, labelPos, active, onHover, onSelect }: {
  x1: number; y1: number; x2: number; y2: number; n: number;
  labelPos?: [number, number]; active: boolean; onHover: (n: number | null) => void; onSelect: (n: number) => void;
}) {
  const color = PALETTE[n - 1];
  const mx = labelPos ? labelPos[0] : (x1 + x2) / 2;
  const my = labelPos ? labelPos[1] : (y1 + y2) / 2;

  return (
    <g
      role="button"
      tabIndex={0}
      style={{ cursor: "pointer", transition: "opacity 180ms ease" }}
      className="outline-none focus-visible:opacity-100"
      onMouseEnter={() => onHover(n)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(n)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect(n)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(n); } }}
    >
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color}
        strokeWidth={active ? 2 : 1.4}
        strokeDasharray="1 4.5"
        strokeLinecap="round"
      />
      <circle cx={x1} cy={y1} r={active ? 3 : 2.2} fill={color} />
      <circle cx={x2} cy={y2} r={active ? 3 : 2.2} fill={color} />
      <circle
        cx={mx} cy={my} r={active ? 10.5 : 9.5}
        fill="#ffffff" stroke={color} strokeWidth={active ? 2.25 : 1.75}
        style={{ transition: "all 150ms ease" }}
      />
      <text
        x={mx} y={my} textAnchor="middle" dominantBaseline="central"
        fontSize={active ? 11.5 : 10.5} fontWeight={700} fill={color}
        style={{ fontFamily: FONT }}
      >
        {n}
      </text>
    </g>
  );
}

/**
 * Interactive flat-lay diagram. Clicking any dimension line (or its legend
 * row) jumps to the matching input field, and hovering/focusing a field
 * highlights its line here — the diagram and the inputs stay in sync.
 */
function DiagramCard({ garment, activeField, onHoverField, onSelectField }: {
  garment: (typeof GARMENTS)[number];
  activeField: string | null;
  onHoverField: (field: string | null) => void;
  onSelectField: (field: string) => void;
}) {
  const activeLine = garment.lines.find((l) => l.field === activeField)?.n ?? null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div
        className="flex justify-center rounded-xl border border-border"
        style={{ background: "radial-gradient(120% 120% at 50% 0%, #faf6f0 0%, #f4efe7 100%)" }}
      >
        <svg viewBox="0 0 200 244" className="w-full max-w-[280px] px-2 py-4" role="img" aria-label={`${garment.eyebrow} measurement diagram`}>
          <path d={garment.path} fill={GARMENT_FILL} stroke={GARMENT_STROKE} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          {garment.lines.map((l) => (
            <DimLine
              key={l.n}
              {...l}
              active={activeLine === l.n}
              onHover={(n) => onHoverField(n === null ? null : l.field)}
              onSelect={() => onSelectField(l.field)}
            />
          ))}
        </svg>
      </div>

      <ul className="mt-4 flex flex-col gap-1">
        {garment.lines.map((l) => {
          const color = PALETTE[l.n - 1];
          const isActive = activeLine === l.n;
          return (
            <li
              key={l.n}
              role="button"
              tabIndex={0}
              onMouseEnter={() => onHoverField(l.field)}
              onMouseLeave={() => onHoverField(null)}
              onFocus={() => onHoverField(l.field)}
              onBlur={() => onHoverField(null)}
              onClick={() => onSelectField(l.field)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectField(l.field); } }}
              style={{ background: isActive ? `${color}14` : "transparent" }}
              className="-mx-2 flex cursor-pointer items-baseline gap-2 rounded-lg px-2 py-1.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <span
                style={{ background: color, color: "#fff" }}
                className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10.5px] font-bold"
              >
                {l.n}
              </span>
              <span className="text-[13px] leading-snug">
                <strong className="font-bold text-foreground">{l.label}</strong>
                <span className="text-foreground/55"> — {l.desc}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Category-aware Measurements step. Shows the diagram that matches the chosen
 * category (switchable), a cm/in toggle, recommended fields with live "Added"
 * feedback, a progress bar and an optional "extra fields" section. Fields keep
 * their `name` so the parent form submits them (always in centimetres).
 */
export function MeasurementsSection({ category, measures, onMeasure }: {
  category: string;
  measures: Record<string, string>;
  onMeasure: (key: string, value: string) => void;
}) {
  const [unit, setUnit] = useState<"cm" | "in">("cm");
  const [activeField, setActiveField] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const group = measureGroupFor(category);
  const defaultKind: GuideKey = group === "bottoms" ? "bottoms" : group === "dress" ? "dress" : "tops";
  const [kind, setKind] = useState<GuideKey>(defaultKind);

  // Keep the diagram in sync when the category changes mid-form.
  useEffect(() => {
    setKind(group === "bottoms" ? "bottoms" : group === "dress" ? "dress" : "tops");
  }, [group]);

  if (group === "none") {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center">
        <p className="text-sm font-bold">No measurements needed for {category}</p>
        <p className="mt-1 text-xs text-foreground/55">
          Shoes and accessories swap as-is — you can skip straight to publishing.
        </p>
      </div>
    );
  }

  const recommended = recommendedFor(category);
  const more = FULL.filter((m) => !recommended.includes(m));

  const filled = new Set(Object.entries(measures).filter(([, v]) => v.trim()).map(([k]) => k));
  const filledCount = recommended.filter((m) => filled.has(m)).length;
  const pct = recommended.length ? (filledCount / recommended.length) * 100 : 0;

  /** Jump the user straight to an input field when they tap a diagram line. */
  const selectField = (field: string) => {
    setActiveField(field);
    inputRefs.current[field]?.focus({ preventScroll: false });
    inputRefs.current[field]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const renderField = (m: string) => (
    <MeasureField
      key={m}
      name={m}
      kind={kind}
      unit={unit}
      value={measures[m] ?? ""}
      onChange={onMeasure}
      onFocus={() => setActiveField(m)}
      onBlur={() => setActiveField(null)}
      active={activeField === m}
      filled={filled.has(m)}
      inputRef={(el) => { inputRefs.current[m] = el; }}
    />
  );

  return (
    <div className="space-y-5">
      {/* How to measure + unit toggle */}
      <div className="flex flex-col gap-3 rounded-2xl border border-brand/20 bg-brand/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Ruler className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div>
            <p className="text-sm font-bold">Measured flat, in cm</p>
            <p className="mt-0.5 text-xs leading-relaxed text-foreground/60">
              Lay the garment flat and measure between the seams — garment size, not your body.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background p-1">
          {(["cm", "in"] as const).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className={cn(
                "rounded-full px-3 py-2 text-sm min-h-9 font-bold transition-colors",
                unit === u ? "bg-brand text-brand-foreground" : "text-foreground/55 hover:text-foreground",
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* Diagram switcher + the active diagram */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {GARMENTS.map((g) => (
            <button
              key={g.key}
              type="button"
              onClick={() => setKind(g.key)}
              className={cn(
                "rounded-full px-3.5 py-2.5 text-sm min-h-11 font-bold transition-colors",
                kind === g.key ? "bg-foreground text-background" : "border border-border bg-background text-foreground/60 hover:border-brand/40 hover:text-brand",
              )}
            >
              {g.eyebrow}
            </button>
          ))}
          <span className="ml-auto text-xs font-medium text-foreground/45">
            Tap a line to jump to that field
          </span>
        </div>
        <DiagramCard
          garment={GARMENTS.find((g) => g.key === kind)!}
          activeField={activeField}
          onHoverField={setActiveField}
          onSelectField={selectField}
        />
      </div>

      {/* Progress */}
      <div>
        <div className="mb-2 flex items-center justify-between text-xs font-bold">
          <span className="text-foreground/70">
            {category ? `Key measurements for ${category}` : "All measurements"}
          </span>
          <span className={filledCount === recommended.length ? "text-emerald-600" : "text-foreground/45"}>
            {filledCount}/{recommended.length} added
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-border">
          <div
            className={cn("h-full rounded-full transition-all duration-500", filledCount === recommended.length ? "bg-emerald-500" : "bg-brand")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Recommended fields */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {recommended.map(renderField)}
      </div>

      {/* Extra fields */}
      {more.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-2.5 text-sm min-h-11 font-bold text-foreground/70 transition-colors hover:border-brand/40 hover:text-brand"
          >
            {showMore ? "Hide" : "Add more measurements"}
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showMore && "rotate-180")} />
          </button>
          {showMore && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {more.map(renderField)}
            </div>
          )}
        </div>
      )}

      {!category && (
        <p className="text-xs text-foreground/50">
          Tip: pick a category in Basics and we&apos;ll show only the measurements that matter for it.
        </p>
      )}
    </div>
  );
}

function MeasureField({ name, kind, unit, value, onChange, onFocus, onBlur, active, filled, inputRef }: {
  name: string;
  kind: GuideKey;
  unit: "cm" | "in";
  value: string;
  onChange: (key: string, value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  active: boolean;
  filled: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const meta = MEASURE_META[name];
  const badge = badgeFor(name, kind);
  const lastValue = useRef(value);
  const [displayValue, setDisplayValue] = useState(() => cmToDisplay(value, unit));

  useEffect(() => {
    if (value !== lastValue.current) {
      setDisplayValue(cmToDisplay(value, unit));
      lastValue.current = value;
    }
  }, [value, unit]);
  return (
    <div className={cn(
      "rounded-2xl border bg-background p-3 transition-all duration-200",
      active ? "border-brand shadow-sm shadow-brand/10" : filled ? "border-emerald-300/60" : "border-border",
    )}>
      <label htmlFor={`m-${name}`} className="flex items-center gap-1.5 text-sm font-bold">
        <span
          style={{ background: badge.color, color: "#fff" }}
          className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full text-[10.5px] font-bold"
        >
          {badge.num}
        </span>
        {meta.label}
      </label>
      <div className="relative mt-2">
        <input
          id={`m-${name}`}
          name={name}
          ref={inputRef}
          value={displayValue}
          onChange={(e) => {
            const nextDisplay = e.target.value;
            const nextValue = displayToCm(nextDisplay, unit);
            setDisplayValue(nextDisplay);
            lastValue.current = nextValue;
            onChange(name, nextValue);
          }}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={unit === "cm" ? meta.placeholder : cmToDisplay(meta.placeholder, unit)}
          inputMode="decimal"
          autoComplete="off"
          className={cn(fieldInput, "pr-10")}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-foreground/35">{unit}</span>
      </div>
      <p className="mt-1.5 text-xs leading-snug text-foreground/50">{meta.tip}</p>
      {filled && (
        <p className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600">
          <Check className="h-3 w-3" /> Added
        </p>
      )}
    </div>
  );
}