import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Repeat, MapPin, Truck, Package, Sparkles, Coins, Check, Plus, Layers } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { fetchMyListings } from "@/lib/dashboard-api";
import { proposeSwap } from "@/lib/swap-api";
import { fetchAddresses } from "@/lib/addresses-api";
import { useModalDialog } from "@/lib/dialog-a11y";

const CARRIER_OPTIONS = [
  { id: "usps", label: "USPS" },
  { id: "ups", label: "UPS" },
  { id: "fedex", label: "FedEx" },
  { id: "dhl", label: "DHL" },
  { id: "royalmail", label: "Royal Mail" },
];

export function ProposeSwapDialog({
  listingId,
  listingTitle,
  listingValue,
  meetupAvailable = false,
  open,
  onClose,
}: {
  listingId: string;
  listingTitle: string;
  listingValue: number;
  meetupAvailable?: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { isAuthenticated } = useAuth();
  const dialogRef = useModalDialog(open, onClose);
  const [offered, setOffered] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [meetup, setMeetup] = useState(false);
  const [meetupPlace, setMeetupPlace] = useState("");
  const [carrier, setCarrier] = useState("usps");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);

  const myListings = useQuery({ queryKey: ["me", "listings"], queryFn: fetchMyListings, enabled: open });
  const addresses = useQuery({ queryKey: ["me", "addresses"], queryFn: fetchAddresses, enabled: open && !meetup });

  const toggleOffer = (id: string) => {
    setOffered((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, id];
    });
  };

  const bundleDocs = useMemo(() => {
    const map = new Map((myListings.data ?? []).map((l) => [l.id, l]));
    return offered.map((id) => map.get(id)).filter(Boolean) as NonNullable<typeof myListings.data>[number][];
  }, [offered, myListings.data]);

  const bundleValue = bundleDocs.reduce((s, l) => s + (l.value ?? 0), 0);
  const netCredits = Math.max(0, listingValue - bundleValue);
  const propose = useMutation({
    mutationFn: () =>
      proposeSwap({
        requestedListing: listingId,
        offeredListing: offered[0] || undefined,
        offeredListings: offered.length ? offered : undefined,
        message: message.trim() || undefined,
        meetup: meetup || undefined,
        meetupPlace: meetup ? meetupPlace.trim() : undefined,
        shipping: !meetup,
        carrier: !meetup ? carrier : undefined,
        shippingAddressId: !meetup ? (selectedAddressId || addresses.data?.find((a) => a.isDefault)?.id) : undefined,
      }),
    onSuccess: (id) => {
      onClose();
      setOffered([]);
      setMessage("");
      void qc.invalidateQueries({ queryKey: ["me", "swaps"] });
      void qc.invalidateQueries({ queryKey: ["me", "unread"] });
      void navigate({ to: "/swaps/$id", params: { id } });
    },
  });

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid place-items-end bg-foreground/40 p-0 backdrop-blur-sm outline-none sm:place-items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Propose a bundle swap"
    >
      <div className="w-full max-w-xl max-h-[92vh] overflow-hidden rounded-t-[1.5rem] border border-border bg-background shadow-2xl sm:rounded-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-br from-brand/[0.08] to-violet-500/[0.06] p-5 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand text-white"><Repeat className="h-4 w-4" /></span>
              <div>
                <h2 className="text-base font-black leading-none">Propose a swap</h2>
                <p className="text-xs text-foreground/60 mt-1">For <span className="font-bold text-foreground">“{listingTitle}”</span> · {listingValue} cr</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-muted">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 font-bold text-white"><Layers className="h-3 w-3" /> Bundle: offer 2–3 for 1</span>
            <span className="text-foreground/50">Popular on Vinted & Depop</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {!isAuthenticated ? (
            <p className="text-sm text-foreground/70">Sign in to start a negotiation.</p>
          ) : (
            <>
              {/* Bundle picker */}
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-foreground/60 flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Your bundle</p>
                  <span className="text-xs font-bold text-foreground/50">{offered.length}/3 selected</span>
                </div>
                <p className="text-xs text-foreground/55 mt-1">Pick up to 3 items you’ll trade. Leave empty to offer credits only.</p>

                {/* Selected pills */}
                {offered.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {bundleDocs.map((l) => (
                      <span key={l.id} className="inline-flex items-center gap-1.5 rounded-full border border-foreground bg-foreground text-background px-2.5 py-2 text-sm min-h-9 font-semibold">
                        <img src={l.images[0]} alt="" className="h-5 w-5 rounded-full object-cover" />
                        {l.title} · {l.value} cr
                        <button onClick={() => toggleOffer(l.id)} className="ml-1 rounded-full bg-white/15 p-0.5 hover:bg-white/25"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                    <button onClick={() => setOffered([])} className="text-xs font-semibold text-foreground/50 hover:text-foreground">Clear</button>
                  </div>
                )}

                <div className="mt-3 grid max-h-56 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3 p-1">
                  <button
                    onClick={() => setOffered([])}
                    className={`relative rounded-xl border-2 p-3 text-left transition ${offered.length === 0 ? "border-brand bg-brand/5 ring-2 ring-brand/20" : "border-border hover:border-foreground/30 bg-card"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`grid h-8 w-8 place-items-center rounded-lg ${offered.length === 0 ? "bg-brand text-white" : "bg-muted"}`}><Coins className="h-4 w-4" /></span>
                      <span className="text-xs font-black">Credits only</span>
                    </div>
                    <span className="mt-2 block text-xs text-foreground/60">{listingValue} cr owed</span>
                    {offered.length === 0 && <Check className="absolute right-2 top-2 h-4 w-4 text-brand" />}
                  </button>
                  {myListings.data
                    ?.filter((l) => l.status === "active")
                    .map((l) => {
                      const selected = offered.includes(l.id);
                      const disabled = !selected && offered.length >= 3;
                      return (
                        <button
                          key={l.id}
                          onClick={() => !disabled && toggleOffer(l.id)}
                          disabled={disabled}
                          className={`relative overflow-hidden rounded-xl border-2 text-left transition ${selected ? "border-brand bg-brand/5 ring-2 ring-brand/20" : disabled ? "border-border opacity-40" : "border-border hover:border-foreground/30 bg-card"}`}
                        >
                          <img src={l.images[0]} alt={l.title} className="aspect-square w-full object-cover" />
                          <div className="p-2">
                            <span className="block truncate text-xs font-bold">{l.title}</span>
                            <span className="text-xs text-foreground/60">{l.value} cr · {l.size}</span>
                          </div>
                          {selected && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-brand text-white"><Check className="h-3.5 w-3.5" /></span>}
                          {!selected && offered.length < 3 && <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-background/90 border border-border"><Plus className="h-3.5 w-3.5" /></span>}
                        </button>
                      );
                    })}
                </div>
                {myListings.data?.filter((l) => l.status === "active").length === 0 && (
                  <p className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">You have no active listings to bundle. You can still offer credits only, or <a href="/sell" className="underline font-bold">list an item</a> first.</p>
                )}
              </div>

              {/* Value summary */}
              <div className="rounded-2xl bg-gradient-to-br from-violet-600 to-brand p-[1px]">
                <div className="rounded-[15px] bg-card p-4">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground/60">Requested</span>
                    <span className="font-black">{listingValue} cr</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground/60">Your bundle ({offered.length} items)</span>
                    <span className="font-black">{bundleValue} cr</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-brand/5 px-3 py-2 border border-brand/20">
                    <span className="flex items-center gap-1.5 text-sm font-black"><Sparkles className="h-4 w-4 text-brand" /> Net credits owed</span>
                    <span className={`text-lg font-black ${netCredits === 0 ? "text-emerald-600" : "text-brand"}`}>{netCredits} cr</span>
                  </div>
                  <p className="mt-2 text-xs text-foreground/50">{netCredits === 0 ? "No credits needed — your bundle covers it!" : `You'll pay ${netCredits} credits on accept (held in escrow).`}</p>
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-black uppercase tracking-wider text-foreground/60">Message (optional)</span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Hey! Love your piece — would you consider my bundle? Happy to meet or ship."
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-foreground"
                />
                <span className="text-xs text-foreground/40">{message.length}/500</span>
              </label>

              {meetupAvailable && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" checked={meetup} onChange={(e) => setMeetup(e.target.checked)} className="h-4 w-4 rounded accent-emerald-600" />
                    <span className="flex items-center gap-1.5 text-sm font-bold text-emerald-800"><MapPin className="h-4 w-4" /> Offer a local meetup</span>
                  </label>
                  {meetup && (
                    <input value={meetupPlace} onChange={(e) => setMeetupPlace(e.target.value)} maxLength={160} placeholder="Suggested spot, e.g. Borough Market, London" className="mt-2 w-full rounded-lg border border-emerald-300 bg-background px-3 py-2 text-sm outline-none focus:border-emerald-600" />
                  )}
                </div>
              )}

              {!meetup && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-3">
                  <div>
                    <p className="flex items-center gap-1.5 text-sm font-bold text-sky-800"><Truck className="h-4 w-4" /> Ship it</p>
                    <p className="text-xs text-sky-700/70 mt-1">Tracking required after accept. Pick a saved address — no re-typing.</p>
                  </div>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-sky-800/70">Ship to (saved address)</span>
                    {addresses.isLoading ? (
                      <p className="text-xs text-sky-700/60 mt-1">Loading addresses…</p>
                    ) : !addresses.data?.length ? (
                      <p className="text-xs text-sky-700/70 mt-1">No saved addresses — <a href="/settings" onClick={onClose} className="underline font-bold">add one in Settings</a>. We’ll use your default profile address.</p>
                    ) : (
                      <select value={selectedAddressId ?? addresses.data.find((a) => a.isDefault)?.id ?? ""} onChange={(e) => setSelectedAddressId(e.target.value)} className="mt-1 w-full rounded-lg border border-sky-300 bg-background px-2 py-2 text-sm">
                        {addresses.data.map((a) => (
                          <option key={a.id} value={a.id}>{a.label ? `${a.label} · ` : ""}{a.line1}, {a.city}{a.isDefault ? " (Default)" : ""}</option>
                        ))}
                      </select>
                    )}
                  </label>
                  <label className="block">
                    <span className="text-xs font-bold uppercase tracking-wide text-sky-800/70">Preferred carrier</span>
                    <select value={carrier} onChange={(e) => setCarrier(e.target.value)} className="mt-1 w-full rounded-lg border border-sky-300 bg-background px-2 py-2 text-sm">
                      {CARRIER_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </label>
                </div>
              )}

              {propose.isError && <p className="text-sm text-red-600">{(propose.error as Error).message || "Couldn't send that proposal."}</p>}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-card p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 rounded-xl border border-border py-3 text-sm font-bold hover:bg-muted">Cancel</button>
          <button onClick={() => propose.mutate()} disabled={propose.isPending || (!isAuthenticated)} className="flex-[1.5] inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand/85 py-3 text-sm font-black text-white shadow-lg shadow-brand/25 hover:-translate-y-0.5 disabled:opacity-60">
            <Repeat className="h-4 w-4" /> {propose.isPending ? "Sending…" : `Send bundle proposal`}
          </button>
        </div>
      </div>
    </div>
  );
}
