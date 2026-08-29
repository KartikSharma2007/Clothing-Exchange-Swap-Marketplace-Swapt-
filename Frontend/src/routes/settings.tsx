import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, BadgeCheck, Bell, Camera, Check, Contrast, Eye, EyeOff, Globe, Loader2, Lock, Menu, Ruler, ShieldAlert, Trash2, User as UserIcon, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { Navbar } from "@/components/site/Navbar";
import { Protected } from "@/components/site/Protected";
import { useAuth } from "@/lib/auth-context";
import { changePassword, deleteAccount, removeAvatar, saveProfile, uploadAvatar } from "@/lib/auth-api";
import { ACCENTS, TEXT_SIZES, usePreferences } from "@/lib/preferences";
import { ApiError } from "@/lib/api";
import { requestPhoneCode, confirmPhoneCode } from "@/lib/moderation-api";
import { enablePush, disablePush, hasPushSubscription, pushSupported } from "@/lib/push";
import { fetchAddresses, createAddress, updateAddress, deleteAddress, setDefaultAddress, type ShippingAddress } from "@/lib/addresses-api";
import { toast } from "sonner";

const TABS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "security", label: "Security", icon: Lock },
  { id: "fit", label: "Fit & size", icon: Ruler },
  { id: "accessibility", label: "Accessibility", icon: Contrast },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy", icon: Eye },
  { id: "preferences", label: "Language & region", icon: Globe },
  { id: "danger", label: "Delete account", icon: ShieldAlert },
] as const;

type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => {
    const tab = search.tab as string | undefined;
    const valid = (TABS as readonly { id: string }[]).some((t) => t.id === tab);
    return { tab: valid ? (tab as TabId) : undefined };
  },
  head: () => ({
    meta: [
      { title: "Settings — Swapt" },
      { name: "description", content: "Manage your Swapt profile, password, accessibility theme, notifications and account." },
      { property: "og:title", content: "Account settings — Swapt" },
      { property: "og:description", content: "Profile, security, accessibility and privacy controls for your Swapt account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Protected>
      <SettingsPage />
    </Protected>
  ),
});

function SettingsPage() {
  const navigate = useNavigate();
  const search = Route.useSearch() as { tab?: TabId };
  const [mobileOpen, setMobileOpen] = useState(false);
  const tab: TabId = search.tab ?? "profile";
  const setTab = (id: TabId) => {
    navigate({ to: "/settings", search: { tab: id } });
  };

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
      const onEsc = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
      document.addEventListener("keydown", onEsc);
      return () => {
        document.body.style.overflow = "";
        document.removeEventListener("keydown", onEsc);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [mobileOpen]);

  const selectTab = (id: TabId) => {
    setTab(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-[1200px] px-4 py-6 md:px-8 md:py-10">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground/60 hover:text-foreground max-md:min-h-11 max-md:rounded-full max-md:border max-md:border-border max-md:bg-card max-md:px-3.5">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl max-md:text-[26px] max-md:leading-none">Settings</h1>
        <p className="mt-1 text-sm text-foreground/60 max-md:text-[13px]">Manage your account, appearance and privacy.</p>

        {/* Mobile hamburger — three-line button, hidden on PC */}
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open settings menu"
          aria-expanded={mobileOpen}
          className="mt-5 inline-flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-bold shadow-sm transition-all hover:bg-muted active:scale-[0.98] lg:hidden"
        >
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-foreground text-background">
              <Menu className="h-4 w-4" />
            </span>
            <span className="flex flex-col items-start leading-none">
              <span className="text-xs font-bold uppercase tracking-widest text-foreground/50">Section</span>
              <span className="text-sm font-black">{TABS.find((t) => t.id === tab)?.label}</span>
            </span>
          </span>
          <span className="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-xs font-black text-brand">
            Menu <span className="text-[10px]">☰</span>
          </span>
        </button>

        <div className="mt-5 grid gap-8 lg:mt-8 lg:grid-cols-[15rem_1fr]">
          {/* PC sidebar — unchanged design */}
          <nav className="hidden lg:flex lg:flex-col gap-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex w-full items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  tab === id
                    ? id === "danger"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-brand text-brand-foreground shadow-sm"
                    : "text-foreground/65 hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </nav>

          {/* Mobile left sidebar drawer */}
          <div
            className={`fixed inset-0 z-50 lg:hidden ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
            aria-hidden={!mobileOpen}
          >
            {/* Overlay */}
            <div
              className={`absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300 ${mobileOpen ? "opacity-100" : "opacity-0"}`}
              onClick={() => setMobileOpen(false)}
            />
            {/* Panel */}
            <div
              className={`absolute left-0 top-0 flex h-full w-[84vw] max-w-[320px] flex-col overflow-hidden border-r border-border bg-card shadow-2xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
            >
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.14em] text-brand">Swapt</p>
                  <p className="text-sm font-black">Settings</p>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  aria-label="Close settings menu"
                  className="grid h-10 w-10 place-items-center rounded-full border border-border bg-background text-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto overscroll-contain p-3">
                <div className="space-y-1.5">
                  {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => selectTab(id)}
                      className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-sm font-semibold transition-all duration-200 ${
                        tab === id
                          ? id === "danger"
                            ? "bg-destructive text-destructive-foreground shadow-md"
                            : "bg-foreground text-background shadow-lg"
                          : "bg-muted/40 text-foreground/70 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <span className={`grid h-9 w-9 place-items-center rounded-xl ${tab === id ? "bg-white/15" : "bg-card shadow-sm"}`}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-left">{label}</span>
                      {tab === id && <span className="h-2 w-2 rounded-full bg-brand" />}
                    </button>
                  ))}
                </div>
              </nav>
              <div className="border-t border-border p-4">
                <p className="text-xs leading-relaxed text-foreground/50">
                  Tip: your changes save instantly. Need help? Visit <Link to="/faq" onClick={() => setMobileOpen(false)} className="font-bold text-brand hover:underline">FAQ</Link>.
                </p>
              </div>
            </div>
          </div>

          <section key={tab} className="animate-fade-in space-y-6">
            {tab === "profile" && <ProfileTab />}
            {tab === "security" && <SecurityTab />}
            {tab === "fit" && <FitTab />}
            {tab === "accessibility" && <AccessibilityTab />}
            {tab === "notifications" && <NotificationsTab />}
            {tab === "privacy" && <PrivacyTab />}
            {tab === "preferences" && <RegionTab />}
            {tab === "danger" && <DangerTab />}
          </section>
        </div>
      </main>
    </div>
  );
}

/* ── Building blocks ─────────────────────────────────────────── */

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 max-md:rounded-3xl max-md:p-4 max-md:shadow-[0_4px_24px_rgba(0,0,0,0.04)] max-md:border-border/60">
      <h2 className="text-lg font-black tracking-tight max-md:text-[17px]">{title}</h2>
      {description && <p className="mt-1 text-sm text-foreground/60 max-md:text-[13px] max-md:leading-relaxed">{description}</p>}
      <div className="mt-5 max-md:mt-4">{children}</div>
    </div>
  );
}

function Labeled({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && <p className="mt-1 text-xs text-foreground/50">{hint}</p>}
    </label>
  );
}

const input = "w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none transition-all focus:border-brand focus:ring-2 focus:ring-brand/25 max-md:rounded-2xl max-md:px-4 max-md:py-3.5 max-md:text-[16px] max-md:shadow-sm";

function Save({ busy, children = "Save changes" }: { busy?: boolean; children?: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-brand-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:opacity-60"
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" />} {children}
    </button>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-4 last:border-0 max-md:py-4 max-md:gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold max-md:text-[15px]">{label}</p>
        <p className="mt-0.5 text-sm text-foreground/60 max-md:text-xs max-md:leading-relaxed">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 max-md:h-7 max-md:w-12 ${checked ? "bg-brand" : "bg-muted"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all duration-200 max-md:h-6 max-md:w-6 ${checked ? "left-[1.4rem] max-md:left-6" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Status({ ok, error }: { ok?: string | null; error?: string | null }) {
  if (error) return <p className="animate-fade-in text-sm font-medium text-destructive">{error}</p>;
  if (ok) return <p className="animate-fade-in flex items-center gap-1.5 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" />{ok}</p>;
  return null;
}

function AddressesManager() {
  const [items, setItems] = useState<ShippingAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ShippingAddress | null>(null);
  const [form, setForm] = useState({ label: "", name: "", line1: "", line2: "", city: "", postal: "", country: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setItems(await fetchAddresses()); } catch {} finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const resetForm = () => { setForm({ label: "", name: "", line1: "", line2: "", city: "", postal: "", country: "", phone: "" }); setEditing(null); setShowForm(false); setError(null); };

  const openAdd = () => { resetForm(); setShowForm(true); };
  const openEdit = (a: ShippingAddress) => { setEditing(a); setForm({ label: a.label, name: a.name, line1: a.line1, line2: a.line2, city: a.city, postal: a.postal, country: a.country, phone: a.phone }); setShowForm(true); };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.line1.trim() || !form.city.trim() || !form.postal.trim() || !form.country.trim()) { setError("Line 1, city, postal and country are required."); return; }
    setBusy(true); setError(null);
    try {
      if (editing) {
        const updated = await updateAddress(editing.id, { ...form, isDefault: editing.isDefault });
        setItems((prev) => prev.map((x) => x.id === updated.id ? updated : x));
        toast.success("Address updated");
      } else {
        const created = await createAddress({ ...form, isDefault: items.length === 0 });
        setItems((prev) => [...prev, created]);
        toast.success("Address added");
      }
      resetForm();
      void load();
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save address"); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this address?")) return;
    try { await deleteAddress(id); setItems((prev) => prev.filter((x) => x.id !== id)); toast.success("Address deleted"); void load(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't delete"); }
  };

  const makeDefault = async (id: string) => {
    try { await setDefaultAddress(id); setItems((prev) => prev.map((x) => ({ ...x, isDefault: x.id === id }))); toast.success("Default address set"); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't set default"); }
  };

  return (
    <Card title="Saved shipping addresses" description="Save up to 5 addresses — pick one when shipping any swap. No more re-typing.">
      {loading ? <p className="text-sm text-foreground/60 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p> : (
        <>
          {items.length === 0 && !showForm && <p className="text-sm text-foreground/60">No saved addresses — add your home or work address.</p>}
          <div className="space-y-3 max-md:space-y-3.5">
            {items.map((a) => (
              <div key={a.id} className={`rounded-xl border p-3 flex gap-3 max-md:rounded-2xl max-md:p-4 max-md:gap-3.5 max-md:shadow-sm ${a.isDefault ? "border-brand bg-brand/5" : "border-border bg-card"}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold flex items-center gap-2 max-md:text-[13px]">{a.label || a.city} {a.isDefault && <span className="rounded-full bg-brand px-1.5 py-0.5 text-xs text-white">Default</span>}</p>
                  <p className="text-xs text-foreground/70 truncate max-md:whitespace-normal max-md:line-clamp-3 max-md:text-[11px] max-md:leading-relaxed max-md:mt-1">{a.name ? `${a.name} · ` : ""}{a.line1}{a.line2 ? `, ${a.line2}` : ""} · {a.city}, {a.postal} · {a.country}{a.phone ? ` · ${a.phone}` : ""}</p>
                </div>
                <div className="flex flex-col gap-1 shrink-0 max-md:gap-1.5 max-md:justify-center">
                  {!a.isDefault && <button onClick={() => void makeDefault(a.id)} className="rounded-lg border border-border px-2 py-2 text-sm min-h-9 font-semibold hover:bg-muted max-md:min-h-11 max-md:px-3.5 max-md:py-2.5 max-md:rounded-xl max-md:text-xs">Default</button>}
                  <button onClick={() => openEdit(a)} className="rounded-lg border border-border px-2 py-2 text-sm min-h-9 font-semibold hover:bg-muted max-md:min-h-11 max-md:px-3.5 max-md:py-2.5 max-md:rounded-xl max-md:text-xs">Edit</button>
                  <button onClick={() => void remove(a.id)} className="rounded-lg border border-rose-200 px-2 py-2 text-sm min-h-9 font-semibold text-rose-600 hover:bg-rose-50 max-md:min-h-11 max-md:px-3.5 max-md:py-2.5 max-md:rounded-xl max-md:text-xs">Delete</button>
                </div>
              </div>
            ))}
          </div>
          {!showForm ? (
            <button onClick={openAdd} disabled={items.length >= 5} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <span className="text-lg leading-none">+</span> Add address {items.length >=5 ? "(max 5)" : ""}
            </button>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Labeled label="Label" hint="Home, Work, etc."><input className={input} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} maxLength={40} placeholder="Home" /></Labeled>
                <Labeled label="Recipient"><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="Jane Doe" /></Labeled>
              </div>
              <Labeled label="Line 1"><input className={input} value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} maxLength={120} placeholder="123 Main St" /></Labeled>
              <Labeled label="Line 2"><input className={input} value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} maxLength={120} placeholder="Apt 4B" /></Labeled>
              <div className="grid gap-3 sm:grid-cols-3">
                <Labeled label="City"><input className={input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} maxLength={80} /></Labeled>
                <Labeled label="Postal"><input className={input} value={form.postal} onChange={(e) => setForm({ ...form, postal: e.target.value })} maxLength={20} /></Labeled>
                <Labeled label="Country"><input className={input} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} maxLength={60} placeholder="USA" /></Labeled>
              </div>
              <Labeled label="Phone"><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={24} /></Labeled>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{busy ? "Saving…" : editing ? "Update" : "Save address"}</button>
                <button type="button" onClick={resetForm} className="rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-muted">Cancel</button>
              </div>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

/** Round avatar — the profile photo if set, otherwise initials on a brand tint. */
function AvatarCircle({ url, name, size = 96 }: { url?: string | null; name?: string; size?: number }) {
  const initials = (name || "?")
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* Classic ornate frame — PC only, hidden on mobile */}
      <div className="pointer-events-none absolute -inset-[5px] hidden rounded-full bg-gradient-to-br from-amber-700 via-[#d4a24a] to-amber-800 p-[2.5px] shadow-xl shadow-amber-900/20 md:block">
        <div className="h-full w-full rounded-full bg-gradient-to-br from-amber-50 to-white p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
          <div className="h-full w-full rounded-full bg-white" />
        </div>
        <span className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-amber-200 ring-1 ring-amber-700/20 shadow-sm" />
        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-amber-200 ring-1 ring-amber-700/20 shadow-sm" />
        <span className="absolute -left-1 -bottom-1 h-2 w-2 rounded-full bg-amber-200 ring-1 ring-amber-700/20 shadow-sm" />
        <span className="absolute -right-1 -bottom-1 h-2 w-2 rounded-full bg-amber-200 ring-1 ring-amber-700/20 shadow-sm" />
      </div>
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full bg-brand/15 text-brand ring-1 ring-brand/20 md:ring-2 md:ring-white md:shadow-lg md:shadow-amber-900/10"
        style={{ fontSize: size * 0.36 }}
      >
        {url ? (
          <img src={url} alt={name || "Profile"} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="font-black">{initials}</span>
        )}
      </div>
    </div>
  );
}

const CROP_PREVIEW = 280;
const CROP_EXPORT = 512;

function clampCrop(crop: { x: number; y: number; size: number }, natW: number, natH: number) {
  const size = Math.min(crop.size, natW, natH);
  const x = Math.min(Math.max(crop.x, 0), Math.max(natW - size, 0));
  const y = Math.min(Math.max(crop.y, 0), Math.max(natH - size, 0));
  return { x, y, size };
}

/** Square crop modal — drag to pan, slider to zoom, exports a 512px JPEG. */
function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => Promise<void> | void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0, size: 0 });
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ sx: number; sy: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      setImg(image);
      setCrop({
        x: (image.naturalWidth - size) / 2,
        y: (image.naturalHeight - size) / 2,
        size,
      });
    };
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw the crop preview into the canvas whenever it changes.
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = CROP_PREVIEW;
    canvas.height = CROP_PREVIEW;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CROP_PREVIEW, CROP_PREVIEW);
    ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, CROP_PREVIEW, CROP_PREVIEW);
  }, [img, crop]);

  const handleZoom = (z: number) => {
    if (!img) return;
    const maxSize = Math.min(img.naturalWidth, img.naturalHeight);
    const size = maxSize / z;
    setZoom(z);
    setCrop((c) => clampCrop({ ...c, size }, img.naturalWidth, img.naturalHeight));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!img) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, cx: crop.x, cy: crop.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !img) return;
    const scale = crop.size / CROP_PREVIEW;
    const dx = (e.clientX - drag.current.sx) * scale;
    const dy = (e.clientY - drag.current.sy) * scale;
    setCrop((c) =>
      clampCrop({ ...c, x: drag.current!.cx + dx, y: drag.current!.cy + dy }, img.naturalWidth, img.naturalHeight),
    );
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const apply = async () => {
    if (!img) return;
    setBusy(true);
    setError(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = CROP_EXPORT;
      canvas.height = CROP_EXPORT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas isn't supported in this browser.");
      ctx.drawImage(img, crop.x, crop.y, crop.size, crop.size, 0, 0, CROP_EXPORT, CROP_EXPORT);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) throw new Error("Couldn't process the image.");
      const cropped = new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
      await onDone(cropped);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't crop the image.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm animate-scale-in rounded-2xl border border-border bg-card p-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-black tracking-tight">Crop your photo</h3>
          <button onClick={onCancel} className="rounded-full p-1.5 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label="Cancel crop">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-foreground/60">Drag to position — use the slider to zoom in and out.</p>

        <div className="relative mt-4 overflow-hidden rounded-xl bg-black/90">
          <canvas
            ref={canvasRef}
            className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
            style={{ aspectRatio: "1 / 1", height: "100%", width: "100%", maxHeight: "min(60vh, 340px)" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {!img && (
            <div className="absolute inset-0 flex items-center justify-center text-xs text-white/70">Loading…</div>
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-foreground/50" />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoom(Number(e.target.value))}
            disabled={!img}
            className="flex-1 accent-[var(--color-brand)]"
            aria-label="Zoom"
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-foreground/50" />
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-5 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={busy || !img}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-brand-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────── */

function ProfileTab() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({
    name: "", phone: "", address: "", age: "", bio: "",
    shipName: "", shipLine1: "", shipLine2: "", shipCity: "", shipPostal: "", shipCountry: "", shipPhone: "",
    preferredCarrier: "", shipsWorldwide: false,
  });
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarOk, setAvatarOk] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.displayName ?? "",
      phone: user.phone ?? "",
      address: user.address ?? user.location ?? "",
      age: user.age ? String(user.age) : "",
      bio: user.bio ?? "",
      shipName: user.shippingProfile?.name ?? "",
      shipLine1: user.shippingProfile?.line1 ?? "",
      shipLine2: user.shippingProfile?.line2 ?? "",
      shipCity: user.shippingProfile?.city ?? "",
      shipPostal: user.shippingProfile?.postal ?? "",
      shipCountry: user.shippingProfile?.country ?? "",
      shipPhone: user.shippingProfile?.phone ?? "",
      preferredCarrier: user.preferredCarrier ?? "",
      shipsWorldwide: Boolean(user.shipsWorldwide),
    });
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk(null); setError(null); setBusy(true);
    try {
      await saveProfile({
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
        age: form.age ? Number(form.age) : null,
        bio: form.bio.trim(),
        shippingProfile: {
          name: form.shipName.trim(),
          line1: form.shipLine1.trim(),
          line2: form.shipLine2.trim(),
          city: form.shipCity.trim(),
          postal: form.shipPostal.trim(),
          country: form.shipCountry.trim(),
          phone: form.shipPhone.trim(),
        },
        preferredCarrier: form.preferredCarrier,
        shipsWorldwide: form.shipsWorldwide,
      });
      await refresh();
      setOk("Profile updated.");
      toast.success("Profile updated successfully!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save your profile.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return setAvatarError("Image must be under 8 MB.");
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(f.type)) {
      return setAvatarError("Only JPEG, PNG, WebP or AVIF images are allowed.");
    }
    setAvatarError(null);
    setAvatarOk(null);
    setCropFile(f);
  };

  const applyAvatar = async (cropped: File) => {
    setAvatarBusy(true);
    setAvatarOk(null);
    setAvatarError(null);
    try {
      await uploadAvatar(cropped);
      await refresh();
      setAvatarOk("Profile photo updated.");
      toast.success("Profile photo updated!");
      setCropFile(null);
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : "Couldn't update your photo.";
      setAvatarError(msg);
      toast.error(msg);
    } finally {
      setAvatarBusy(false);
    }
  };

  const removePhoto = async () => {
    if (!user?.avatarUrl) return;
    setAvatarBusy(true);
    setAvatarOk(null);
    setAvatarError(null);
    try {
      await removeAvatar();
      await refresh();
      setAvatarOk("Profile photo removed.");
      toast.success("Profile photo removed");
    } catch (err) {
      const msg = err instanceof ApiError || err instanceof Error ? err.message : "Couldn't remove your photo.";
      setAvatarError(msg);
      toast.error(msg);
    } finally {
      setAvatarBusy(false);
    }
  };

  return (
    <>
      <Card title="Profile photo" description="Your photo appears next to your listings and in chat.">
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center max-md:items-center max-md:text-center max-md:gap-4">
          <AvatarCircle url={user?.avatarUrl} name={user?.displayName} size={96} />
          <div className="space-y-2.5 max-md:w-full max-md:space-y-3">
            <div className="flex flex-wrap gap-2 max-md:justify-center max-md:gap-2.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-brand-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 max-md:min-h-11 max-md:px-5 max-md:py-2.5 max-md:rounded-2xl max-md:shadow-md"
              >
                <Camera className="h-4 w-4" /> {user?.avatarUrl ? "Change photo" : "Upload photo"}
              </button>
              {user?.avatarUrl && (
                <button
                  type="button"
                  onClick={removePhoto}
                  disabled={avatarBusy}
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted disabled:opacity-60 max-md:min-h-11 max-md:px-5 max-md:py-2.5 max-md:rounded-2xl max-md:bg-card"
                >
                  <Trash2 className="h-4 w-4" /> Remove
                </button>
              )}
            </div>
            <p className="text-xs text-foreground/50 max-md:text-[13px] max-md:leading-relaxed">
              Square images look best. JPEG, PNG, WebP or AVIF, up to 8 MB. If you signed up with Google, your Google
              photo is shown automatically — upload one here if you don't have a profile picture yet.
            </p>
            <Status ok={avatarOk} error={avatarError} />
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={pickFile}
        />
      </Card>

      <Card title="Profile information" description="This is what other swappers see on your listings and chats.">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Full name"><input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></Labeled>
            <Labeled label="Age"><input type="number" min={13} max={120} className={input} value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} /></Labeled>
            <Labeled label="Phone number"><input className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Labeled>
            <Labeled label="Email" hint="Contact support to change your sign-in email.">
              <input className={`${input} opacity-70`} value={user?.email ?? ""} readOnly />
            </Labeled>
          </div>
          <Labeled label="Address"><input className={input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} maxLength={160} /></Labeled>
          <Labeled label="Bio" hint="Optional — up to 300 characters.">
            <textarea rows={4} maxLength={300} className={input} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </Labeled>
          <div className="flex items-center gap-4"><Save busy={busy} /><Status ok={ok} error={error} /></div>
        </form>
      </Card>

      <AddressesManager />

      <Card
        title="Shipping profile (legacy single address)"
        description="Legacy single address — kept for backwards compatibility. Use “Saved shipping addresses” above for multiple addresses."
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Recipient name"><input className={input} value={form.shipName} onChange={(e) => setForm({ ...form, shipName: e.target.value })} maxLength={80} /></Labeled>
            <Labeled label="Country"><input className={input} value={form.shipCountry} onChange={(e) => setForm({ ...form, shipCountry: e.target.value })} maxLength={60} /></Labeled>
          </div>
          <Labeled label="Address line 1"><input className={input} value={form.shipLine1} onChange={(e) => setForm({ ...form, shipLine1: e.target.value })} maxLength={120} /></Labeled>
          <Labeled label="Address line 2" hint="Optional — apartment, suite, etc.">
            <input className={input} value={form.shipLine2} onChange={(e) => setForm({ ...form, shipLine2: e.target.value })} maxLength={120} />
          </Labeled>
          <div className="grid gap-4 sm:grid-cols-3">
            <Labeled label="City"><input className={input} value={form.shipCity} onChange={(e) => setForm({ ...form, shipCity: e.target.value })} maxLength={80} /></Labeled>
            <Labeled label="Postal code"><input className={input} value={form.shipPostal} onChange={(e) => setForm({ ...form, shipPostal: e.target.value })} maxLength={20} /></Labeled>
            <Labeled label="Phone (delivery)"><input className={input} value={form.shipPhone} onChange={(e) => setForm({ ...form, shipPhone: e.target.value })} maxLength={24} /></Labeled>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Labeled label="Preferred carrier" hint="Your default when shipping a swap.">
              <select
                className={input}
                value={form.preferredCarrier}
                onChange={(e) => setForm({ ...form, preferredCarrier: e.target.value })}
              >
                <option value="">No preference</option>
                <option value="usps">USPS</option>
                <option value="ups">UPS</option>
                <option value="fedex">FedEx</option>
                <option value="dhl">DHL</option>
                <option value="royalmail">Royal Mail</option>
              </select>
            </Labeled>
          </div>
          <Toggle
            label="Ships worldwide"
            description="Open to sending swaps internationally."
            checked={form.shipsWorldwide}
            onChange={(v) => setForm({ ...form, shipsWorldwide: v })}
          />
          <div className="flex items-center gap-4"><Save busy={busy} /><Status ok={ok} error={error} /></div>
        </div>
      </Card>

      <PhoneVerificationCard />

      {cropFile && <AvatarCropper file={cropFile} onCancel={() => setCropFile(null)} onDone={applyAvatar} />}
    </>
  );
}

const MEASUREMENT_FIELDS: { key: string; label: string; hint: string }[] = [
  { key: "chest", label: "Chest", hint: "Bust / chest circumference" },
  { key: "waist", label: "Waist", hint: "Natural waist circumference" },
  { key: "hips", label: "Hips", hint: "Widest part around hips" },
  { key: "length", label: "Body length", hint: "Shoulder to hem" },
  { key: "inseam", label: "Inseam", hint: "Top of inner leg to hem" },
  { key: "shoulder", label: "Shoulder", hint: "Shoulder seam to seam" },
  { key: "sleeve", label: "Sleeve", hint: "Shoulder seam to cuff" },
];

function FitTab() {
  const { user, refresh } = useAuth();
  const [height, setHeight] = useState("");
  const [usualSize, setUsualSize] = useState("");
  const [measures, setMeasures] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setHeight(user.heightCm ? String(user.heightCm) : "");
    setUsualSize(user.usualSize ?? "");
    const m = user.measurements ?? {};
    setMeasures({
      chest: m.chest ?? "",
      waist: m.waist ?? "",
      hips: m.hips ?? "",
      length: m.length ?? "",
      inseam: m.inseam ?? "",
      shoulder: m.shoulder ?? "",
      sleeve: m.sleeve ?? "",
    });
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk(null);
    setError(null);
    setBusy(true);
    try {
      await saveProfile({
        heightCm: height.trim() ? Number(height.trim()) : null,
        usualSize,
        measurements: {
          chest: measures.chest?.trim() ?? "",
          waist: measures.waist?.trim() ?? "",
          hips: measures.hips?.trim() ?? "",
          length: measures.length?.trim() ?? "",
          inseam: measures.inseam?.trim() ?? "",
          shoulder: measures.shoulder?.trim() ?? "",
          sleeve: measures.sleeve?.trim() ?? "",
        },
      });
      await refresh();
      setOk("Measurements saved. 'Likely fits you' flags update across the catalog.");
      toast.success("Fit & size saved!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save your measurements.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const setMeasure = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setMeasures((m) => ({ ...m, [key]: e.target.value }));

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card
        title="Size & fit intelligence"
        description="Save your measurements and we flag 'likely fits you' items across the catalog. Enter numbers in centimetres — e.g. 96 for a 96 cm chest."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Labeled label="Height (cm)">
            <input
              type="number"
              min={80}
              max={260}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              className={input}
              placeholder="175"
            />
          </Labeled>
          <Labeled label="Usual size">
            <select value={usualSize} onChange={(e) => setUsualSize(e.target.value)} className={input}>
              <option value="">Not sure</option>
              {SIZES_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Labeled>
        </div>
      </Card>

      <Card title="Body measurements (cm)" description="Flat measurements the way sellers list them. At least one of chest, waist or hips is enough to start matching.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 max-md:grid-cols-1 max-md:gap-3.5">
          {MEASUREMENT_FIELDS.map(({ key, label, hint }) => (
            <Labeled key={key} label={label} hint={hint}>
              <input
                inputMode="decimal"
                value={measures[key] ?? ""}
                onChange={setMeasure(key)}
                className={input}
                placeholder="e.g. 96"
              />
            </Labeled>
          ))}
        </div>
        <div className="mt-5 flex items-center gap-4">
          <Save busy={busy} />
          <Status ok={ok} error={error} />
        </div>
      </Card>
    </form>
  );
}

const SIZES_OPTIONS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

function PhoneVerificationCard() {
  const { user, refresh } = useAuth();
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"idle" | "sent" | "busy">("idle");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState("");

  if (user?.phoneVerified) {
    return (
      <Card title="Verified member" description="Your phone number is verified — this badge appears on your profile.">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <BadgeCheck className="h-5 w-5" /> Phone verified
        </div>
      </Card>
    );
  }

  const send = async () => {
    setError(null);
    setStage("busy");
    try {
      const res = await requestPhoneCode();
      setDevCode(res.devCode ?? "");
      setStage("sent");
      toast.success("Verification code sent!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't send the code. Add a phone number first.";
      setStage("idle");
      setError(msg);
      toast.error(msg);
    }
  };

  const confirm = async () => {
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit code."); return; }
    setError(null);
    setConfirmBusy(true);
    try {
      await confirmPhoneCode(code);
      await refresh();
      setStage("idle");
      toast.success("Phone verified — your badge is live!");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "That code didn't work.";
      setStage("sent");
      setError(msg);
      toast.error(msg);
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <Card
      title="Verify your phone"
      description="Confirm your number once to earn a verified badge on your profile — it helps buyers trust you."
    >
      {stage === "sent" ? (
        <div className="space-y-3">
          <Labeled label="6-digit code">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
              inputMode="numeric"
              autoFocus
              className={input}
            />
          </Labeled>
          {devCode && (
            <p className="rounded-lg bg-muted px-3 py-2 text-xs text-foreground/60">
              Demo mode — your code is <span className="font-mono font-bold text-foreground">{devCode}</span>
            </p>
          )}
          {error && <Status error={error} />}
          <div className="flex items-center gap-2">
            <button onClick={confirm} disabled={confirmBusy} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
              {confirmBusy ? "Verifying…" : "Confirm code"}
            </button>
            <button onClick={send} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted">
              Resend
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-foreground/70">We'll send a one-time code to {user?.phone || "your phone number"}.</p>
          {error && <Status error={error} />}
          <div className="flex items-center gap-2">
            <button onClick={send} disabled={stage === "busy"} className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
              {stage === "busy" ? "Sending…" : "Send code"}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SecurityTab() {
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOk(null); setError(null);
    if (form.next.length < 8 || !/[A-Z]/.test(form.next) || !/[0-9]/.test(form.next)) {
      return setError("New password needs 8+ characters, an uppercase letter and a number.");
    }
    if (form.next !== form.confirm) return setError("New passwords don't match.");
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: "", next: "", confirm: "" });
      setShowCurrent(false); setShowNext(false); setShowConfirm(false);
      setOk("Password has been changed successfully!");
      toast.success("Password has been changed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't update your password.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="Change password" description="Use a password you don't reuse anywhere else.">
        <form onSubmit={submit} className="max-w-md space-y-4">
          <Labeled label="Current password">
            <div className="relative">
              <input type={showCurrent ? "text" : "password"} className={`${input} pr-10`} value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} placeholder="Enter current password" autoComplete="current-password" />
              <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label={showCurrent ? "Hide password" : "Show password"}>
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Labeled>
          <Labeled label="New password" hint="8+ characters, one uppercase letter and one number.">
            <div className="relative">
              <input type={showNext ? "text" : "password"} className={`${input} pr-10`} value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} placeholder="Enter new password" autoComplete="new-password" />
              <button type="button" onClick={() => setShowNext((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label={showNext ? "Hide password" : "Show password"}>
                {showNext ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Labeled>
          <Labeled label="Confirm new password">
            <div className="relative">
              <input type={showConfirm ? "text" : "password"} className={`${input} pr-10`} value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Confirm new password" autoComplete="new-password" />
              <button type="button" onClick={() => setShowConfirm((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground" aria-label={showConfirm ? "Hide password" : "Show password"}>
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Labeled>
          <div className="flex items-center gap-4">
            <Save busy={busy}>Update password</Save>
            <Status ok={ok} error={error} />
          </div>
          <div className="mt-3">
            <Link to="/forgot" search={{ from: "settings", tab: "security" } as any} className="text-sm font-semibold text-brand hover:underline">Forgot password?</Link>
          </div>
        </form>
      </Card>

      <Card title="Sessions & devices" description="You're signed in on this device. Signing out everywhere revokes all refresh tokens.">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
          <div>
            <p className="text-sm font-semibold">This browser</p>
            <p className="text-xs text-foreground/60">Active now · last used just then</p>
          </div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">Current</span>
        </div>
      </Card>
    </>
  );
}

function AccessibilityTab() {
  const prefs = usePreferences();
  useSyncPrefsFromUser();
  const { refresh } = useAuth();
  const [savingAccent, setSavingAccent] = useState<string | null>(null);
  const handleAccent = async (value: typeof prefs.accent) => {
    // Instant local feedback — works offline, no revert on server failure
    prefs.set("accent", value);
    setSavingAccent(value);
    try {
      await saveProfile({ accent: value } as any);
      try { await refresh(); } catch {}
      toast.success("Theme updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Theme applied locally — couldn't sync to account");
    } finally {
      setSavingAccent(null);
    }
  };
  return (
    <>
      <Card title="Colour theme" description="Pick an accent — the whole site recolours instantly. Emails will match this colour.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 max-md:gap-2.5">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              onClick={() => handleAccent(a.value)}
              aria-pressed={prefs.accent === a.value}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all duration-200 hover:-translate-y-0.5 max-md:rounded-xl max-md:p-3 max-md:gap-1.5 ${
                prefs.accent === a.value ? "border-brand shadow-md max-md:shadow-sm" : "border-border"
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full max-md:h-9 max-md:w-9" style={{ backgroundColor: a.swatch }}>
                {prefs.accent === a.value && <Check className="h-5 w-5 text-white" />}
              </span>
              <span className="text-xs font-semibold capitalize max-md:text-[11px]">{a.value}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Text size" description="Scales typography across every page.">
        <div className="grid gap-3 sm:grid-cols-3 max-md:gap-2.5">
          {TEXT_SIZES.map((t) => (
            <button
              key={t.value}
              onClick={() => prefs.set("textSize", t.value)}
              aria-pressed={prefs.textSize === t.value}
              className={`rounded-2xl border-2 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 max-md:rounded-xl max-md:p-3 ${
                prefs.textSize === t.value ? "border-brand bg-brand/5" : "border-border"
              }`}
            >
              <span className={`block font-black ${t.value === "small" ? "text-sm" : t.value === "medium" ? "text-lg" : "text-2xl"} max-md:text-base`}>Aa</span>
              <span className="mt-1 block text-sm font-semibold max-md:text-xs">{t.label}</span>
              <span className="mt-0.5 block text-xs text-foreground/55 max-md:text-[11px] max-md:leading-snug">{t.hint}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Display">
        <Toggle label="Dark mode" description="Switch to a low-light colour scheme." checked={prefs.mode === "dark"} onChange={(v) => prefs.set("mode", v ? "dark" : "light")} />
        <Toggle label="Reduce motion" description="Minimise animations and transitions across the site." checked={prefs.reducedMotion} onChange={(v) => prefs.set("reducedMotion", v)} />
        <div className="pt-4">
          <button
            onClick={async () => {
              prefs.reset();
              try {
                await saveProfile({ accent: "red", swapAlerts: true, emailUpdates: true, marketing: false, publicProfile: true, showLocation: true, language: "en-GB", currency: "GBP" });
                toast.success("Reset to defaults — synced to account");
              } catch {}
            }}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted"
          >
            Reset to defaults
          </button>
        </div>
      </Card>
      {savingAccent && <p className="text-xs text-foreground/50 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving accent…</p>}
    </>
  );
}

/** Sync local preference store with the server's saved profile — runs once when user loads.
 *  Without this, toggles show localStorage defaults on a new device instead of the account's true settings,
 *  making it look like they "don't work" after a refresh.
 *  We only sync on first load to avoid overwriting a fresh local choice (e.g. accent) */
function useSyncPrefsFromUser() {
  const { user } = useAuth();
  const prefs = usePreferences();
  const hasSynced = useRef(false);
  useEffect(() => {
    if (!user || hasSynced.current) return;
    hasSynced.current = true;
    const u = user as unknown as Record<string, unknown>;
    const map: Record<string, keyof typeof prefs> = {
      accent: "accent",
      swapAlerts: "swapAlerts",
      emailUpdates: "emailUpdates",
      marketing: "marketing",
      publicProfile: "publicProfile",
      showLocation: "showLocation",
      language: "language",
      currency: "currency",
    };
    for (const [serverKey, prefKey] of Object.entries(map)) {
      const serverVal = u[serverKey];
      if (serverVal !== undefined && serverVal !== null && prefs[prefKey] !== serverVal) {
        // @ts-ignore — dynamic key
        prefs.set(prefKey as any, serverVal as any);
      }
    }
  }, [user]);
}

/** Update a persisted preference both locally and on the account, so the
 *  toggle actually takes effect (server enforces swapAlerts / privacy).
 *  Now with optimistic UI + revert on failure and toast feedback for smooth UX. */
function usePersistPref() {
  const { refresh } = useAuth();
  return async <K extends "swapAlerts" | "emailUpdates" | "marketing" | "publicProfile" | "showLocation" | "accent">(
    prefs: ReturnType<typeof usePreferences>,
    key: K,
    value: any,
  ) => {
    const prev = (prefs as any)[key];
    (prefs as any).set(key, value);
    try {
      const user = await saveProfile({ [key]: value } as Parameters<typeof saveProfile>[0]);
      if (user) void refresh();
      toast.success(`${String(key)} updated`);
    } catch (err) {
      // Revert on failure so UI truth matches server — feels smooth, not stuck
      (prefs as any).set(key, prev);
      toast.error(err instanceof Error ? err.message : "Couldn't save preference");
      throw err;
    }
  };
}

function NotificationsTab() {
  const prefs = usePreferences();
  const persist = usePersistPref();
  useSyncPrefsFromUser();
  const [saving, setSaving] = useState<string | null>(null);
  const handle = async (key: "swapAlerts" | "emailUpdates" | "marketing", value: boolean) => {
    setSaving(key);
    try { await persist(prefs as any, key as any, value as any); } finally { setSaving(null); }
  };
  return (
    <Card title="Notifications" description="Choose what lands in your inbox. Changes save instantly and sync across devices.">
      <div className={saving ? "opacity-60 pointer-events-none transition-opacity" : "transition-opacity"}>
        <Toggle label="Swap activity" description="Offers, replies and status changes on your swaps." checked={prefs.swapAlerts} onChange={(v) => void handle("swapAlerts", v)} />
        <Toggle label="Account emails" description="Security alerts and important account updates — always sent for safety, toggle controls extra updates." checked={prefs.emailUpdates} onChange={(v) => void handle("emailUpdates", v)} />
        <Toggle label="Marketing & drops" description="Weekly picks, trending brands and community news." checked={prefs.marketing} onChange={(v) => void handle("marketing", v)} />
      </div>
      <PushToggleRow />
      {saving && <p className="mt-2 text-xs text-foreground/50 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</p>}
    </Card>
  );
}

/** Browser push notifications (Web Push / VAPID) — opt-in per device. */
function PushToggleRow() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void hasPushSubscription().then((v) => { if (mounted) setEnabled(v); });
    return () => { mounted = false; };
  }, []);

  if (enabled === null || busy) return null;
  if (!pushSupported()) {
    return (
      <div className="border-b border-border py-4 last:border-0">
        <p className="text-sm font-semibold">Browser notifications</p>
        <p className="mt-0.5 text-sm text-foreground/60">Push needs a public VAPID key (set on the server) — not available in this preview.</p>
      </div>
    );
  }

  return (
    <Toggle
      label="Browser notifications"
      description="Get new-message, swap and saved-search alerts even when Swapt is closed."
      checked={enabled}
      onChange={async (v) => {
        setBusy(true);
        if (v) {
          const ok = await enablePush();
          setEnabled(ok);
          if (!ok) toast.error("Couldn't enable browser notifications");
        } else {
          await disablePush();
          setEnabled(false);
        }
        setBusy(false);
      }}
    />
  );
}

function PrivacyTab() {
  const prefs = usePreferences();
  const persist = usePersistPref();
  useSyncPrefsFromUser();
  const [saving, setSaving] = useState<string | null>(null);
  const handle = async (key: "publicProfile" | "showLocation", value: boolean) => {
    setSaving(key);
    try { await persist(prefs as any, key as any, value as any); } finally { setSaving(null); }
  };
  return (
    <Card title="Privacy" description="Control what other members can see. Changes apply instantly — private profiles are hidden from browse and search.">
      <div className={saving ? "opacity-60 pointer-events-none" : ""}>
        <Toggle label="Public profile" description="Let anyone view your profile and listings. Off = only you and admins see your closet." checked={prefs.publicProfile} onChange={(v) => void handle("publicProfile", v)} />
        <Toggle label="Show my location" description="Display your city on listings to help local swaps. Off = listings show no city to others." checked={prefs.showLocation} onChange={(v) => void handle("showLocation", v)} />
      </div>
      {saving && <p className="mt-2 text-xs text-foreground/50 flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</p>}
    </Card>
  );
}

function RegionTab() {
  const prefs = usePreferences();
  const { user } = useAuth();
  useSyncPrefsFromUser();
  const [saving, setSaving] = useState<string | null>(null);
  const apply = (key: "language" | "currency") => async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    const prev = prefs[key];
    prefs.set(key, value as any);
    if (user) {
      setSaving(key);
      try {
        await saveProfile({ [key]: value } as any);
        toast.success(`${key} updated`);
      } catch {
        prefs.set(key, prev as any);
        toast.error("Couldn't save preference");
      } finally { setSaving(null); }
    }
  };

  return (
    <Card title="Language & region" description="Formatting for dates, numbers and prices.">
      <div className="grid max-w-lg gap-4 sm:grid-cols-2">
        <Labeled label="Language">
          <select className={input} value={prefs.language} onChange={apply("language")} disabled={Boolean(saving)}>
            <option value="en-GB">English (UK)</option>
            <option value="en-US">English (US)</option>
            <option value="fr-FR">Français</option>
            <option value="es-ES">Español</option>
            <option value="hi-IN">हिन्दी</option>
          </select>
        </Labeled>
        <Labeled label="Currency">
          <select className={input} value={prefs.currency} onChange={apply("currency")} disabled={Boolean(saving)}>
            <option value="GBP">GBP £</option>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="INR">INR ₹</option>
          </select>
        </Labeled>
      </div>
      <p className="mt-3 text-xs text-foreground/50">
        Dates, numbers and prices follow your language and currency. Swap values stay in credits.
      </p>
    </Card>
  );
}

function DangerTab() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await deleteAccount(password);
      toast.success("Account deleted");
      await refresh();
      void navigate({ to: "/", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't delete your account.";
      setError(msg);
      toast.error(msg);
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-destructive/30 bg-destructive/5 p-5 sm:p-6">
      <h2 className="text-lg font-black tracking-tight text-destructive">Delete account</h2>
      <p className="mt-2 text-sm text-foreground/70">
        This is a <strong>soft delete</strong>. Your profile, listings and swap history are retained in the database
        for record-keeping and dispute resolution, but they immediately disappear from Swapt and you won't be able to
        sign in with this email or password again.
      </p>

      {!confirmOpen ? (
        <button
          onClick={() => setConfirmOpen(true)}
          className="mt-5 rounded-xl bg-destructive px-5 py-2.5 text-sm font-bold text-destructive-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          Delete my account
        </button>
      ) : (
        <form onSubmit={remove} className="mt-5 max-w-md animate-fade-in space-y-4">
          <Labeled label="Confirm your password">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                className={input}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-foreground/50 transition-colors hover:text-foreground"
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Labeled>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={busy || !password}
              className="inline-flex items-center gap-2 rounded-xl bg-destructive px-5 py-2.5 text-sm font-bold text-destructive-foreground disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, delete my account
            </button>
            <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-xl border border-border bg-background px-5 py-2.5 text-sm font-semibold">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
