import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Loader2, MapPin, Navigation, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import "leaflet/dist/leaflet.css";

// Leaflet is client-only — we load it lazily to avoid SSR crashes.
type LatLng = { lat: number; lng: number };

type Suggestion = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  address?: Record<string, string>;
};

type Props = {
  value: string;
  lat?: number | null;
  lng?: number | null;
  onChange: (v: { place: string; lat: number | null; lng: number | null }) => void;
  placeholder?: string;
  error?: string;
  label?: string;
  required?: boolean;
};

export function LocationPicker({ value, lat, lng, onChange, placeholder = "Search for area, street, city…", error, label, required }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSug, setShowSug] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [internalLat, setInternalLat] = useState<number | null>(lat ?? null);
  const [internalLng, setInternalLng] = useState<number | null>(lng ?? null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchId = useRef(0);

  // Keep internal lat/lng in sync when parent changes (e.g. dialog opens)
  useEffect(() => {
    setQuery(value);
  }, [value]);
  useEffect(() => {
    setInternalLat(lat ?? null);
    setInternalLng(lng ?? null);
  }, [lat, lng]);

  // Debounced autocomplete
  useEffect(() => {
    const q = query.trim();
    if (!q || q === value) {
      // Don't search if query equals current value (already selected)
      return;
    }
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    const id = ++fetchId.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=5`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        const data = (await res.json()) as Suggestion[];
        if (fetchId.current !== id) return;
        setSuggestions(Array.isArray(data) ? data : []);
        setShowSug(true);
      } catch {
        if (fetchId.current === id) setSuggestions([]);
      } finally {
        if (fetchId.current === id) setLoading(false);
      }
    }, 380);
    return () => clearTimeout(t);
  }, [query, value]);

  const pickSuggestion = (s: Suggestion) => {
    const nlat = parseFloat(s.lat);
    const nlng = parseFloat(s.lon);
    setQuery(s.display_name);
    setSuggestions([]);
    setShowSug(false);
    setInternalLat(nlat);
    setInternalLng(nlng);
    onChange({ place: s.display_name, lat: nlat, lng: nlng });
  };

  const onInputChange = (v: string) => {
    setQuery(v);
    // Typing clears precise pin until user picks a suggestion or drags map
    if (v !== value) {
      setInternalLat(null);
      setInternalLng(null);
      onChange({ place: v, lat: null, lng: null });
    } else {
      onChange({ place: v, lat: internalLat, lng: internalLng });
    }
    if (v.trim().length >= 3) setShowSug(true);
    else setSuggestions([]);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    blurTimer.current = setTimeout(() => setShowSug(false), 180);
  };
  const handleFocus = () => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    if (suggestions.length) setShowSug(true);
  };

  const handleManualPlaceSubmit = () => {
    // If user typed and didn't pick, keep typed place but clear lat/lng unless we can geocode
    // Try to geocode the typed query via first suggestion if available
    if (suggestions.length) {
      pickSuggestion(suggestions[0]);
    } else {
      onChange({ place: query.trim(), lat: internalLat, lng: internalLng });
      setShowSug(false);
    }
  };

  const reverseGeocode = async (rlat: number, rlng: number) => {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${rlat}&lon=${rlng}&zoom=16&addressdetails=1`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      const data = (await res.json()) as { display_name?: string };
      const place = data.display_name || `${rlat.toFixed(5)}, ${rlng.toFixed(5)}`;
      setQuery(place);
      onChange({ place, lat: rlat, lng: rlng });
    } catch {
      onChange({ place: `${rlat.toFixed(5)}, ${rlng.toFixed(5)}`, lat: rlat, lng: rlng });
    }
  };

  const handleMapPick = (nlat: number, nlng: number) => {
    setInternalLat(nlat);
    setInternalLng(nlng);
    void reverseGeocode(nlat, nlng);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setInternalLat(latitude);
        setInternalLng(longitude);
        void reverseGeocode(latitude, longitude);
        setIsLocating(false);
      },
      () => setIsLocating(false),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  };

  const effectiveCenter = useMemo<LatLng | null>(() => {
    if (internalLat != null && internalLng != null) return { lat: internalLat, lng: internalLng };
    if (lat != null && lng != null) return { lat, lng };
    return null;
  }, [internalLat, internalLng, lat, lng]);

  // Default center for India if nothing selected
  const defaultCenter: LatLng = { lat: 20.5937, lng: 78.9629 };

  return (
    <div className="space-y-2">
      {label && (
        <span className="text-xs font-bold uppercase tracking-wider text-foreground/50">
          {label} {required && <span className="text-rose-500">*</span>}
        </span>
      )}
      <div className="relative">
        <div
          className={cn(
            "group flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-sm transition-colors",
            "focus-within:border-brand/60 focus-within:ring-4 focus-within:ring-brand/10",
            error ? "border-rose-300 bg-rose-50/20 focus-within:border-rose-400 focus-within:ring-rose-200/30" : "border-border",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-foreground/40 group-focus-within:text-brand" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onInputChange(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleManualPlaceSubmit();
              }
              if (e.key === "Escape") setShowSug(false);
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-foreground/35"
          />
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-foreground/40" />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setSuggestions([]);
                onChange({ place: "", lat: null, lng: null });
                inputRef.current?.focus();
              }}
              className="grid h-7 w-7 place-items-center rounded-full text-foreground/40 hover:bg-muted"
              aria-label="Clear"
            >
              ×
            </button>
          ) : null}
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={isLocating}
            title="Use current location"
            className="hidden sm:inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-2 text-sm min-h-9 font-bold text-brand hover:bg-brand hover:text-white transition-colors disabled:opacity-60"
          >
            {isLocating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Crosshair className="h-3 w-3" />}
            Current
          </button>
        </div>

        {/* Suggestions dropdown — portal-like absolute but clipped correctly */}
        {showSug && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-64 overflow-auto rounded-xl border border-border bg-card shadow-xl">
            {suggestions.map((s) => (
              <button
                key={s.place_id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(s)}
                className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{s.display_name}</span>
                  <span className="block truncate text-xs text-foreground/50">
                    {s.address ? [s.address.road, s.address.city || s.address.town || s.address.village, s.address.state, s.address.country].filter(Boolean).join(", ") : `${s.lat}, ${s.lon}`}
                  </span>
                </span>
              </button>
            ))}
            <div className="border-t border-border bg-muted/30 px-3 py-2.5 text-sm min-h-11 text-foreground/40">Powered by OpenStreetMap • Tip: drag the pin on the map for exact location</div>
          </div>
        )}

        {/* Mobile current location button */}
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={isLocating}
          className="mt-2 flex w-full sm:hidden items-center justify-center gap-1.5 rounded-lg border border-brand/20 bg-brand/5 py-2 text-xs font-bold text-brand hover:bg-brand/10 disabled:opacity-60"
        >
          {isLocating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
          Use current location (GPS)
        </button>
      </div>

      {/* Swiggy-like map picker */}
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="flex items-center justify-between bg-muted/40 px-3 py-1.5">
          <span className="flex items-center gap-1.5 text-xs font-bold text-foreground/60">
            <MapPin className="h-3.5 w-3.5" /> Tap map or drag pin to set exact location
          </span>
          {effectiveCenter && (
            <span className="hidden sm:inline text-xs font-mono text-foreground/40">
              {effectiveCenter.lat.toFixed(4)}, {effectiveCenter.lng.toFixed(4)}
            </span>
          )}
        </div>
        <div className="relative h-[220px] sm:h-[260px] w-full bg-muted">
          <LeafletMap center={effectiveCenter ?? defaultCenter} zoom={effectiveCenter ? 14 : 5} onPick={handleMapPick} marker={effectiveCenter} onReady={() => setMapReady(true)} />
          {!mapReady && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-muted/60">
              <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-2.5 text-sm min-h-11 font-semibold shadow">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading map…
              </span>
            </div>
          )}
          {/* Center pin overlay like Swiggy when no marker yet */}
          {!effectiveCenter && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[14px]">
              <div className="relative">
                <MapPin className="h-8 w-8 text-brand drop-shadow-lg" fill="currentColor" />
                <span className="absolute -bottom-1 left-1/2 h-2 w-3 -translate-x-1/2 rounded-[50%] bg-black/20 blur-[2px]" />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between bg-card px-3 py-2">
          <span className="truncate text-xs text-foreground/60">{value || query || "No location selected"}</span>
          <button
            type="button"
            onClick={() => {
              if (effectiveCenter) void reverseGeocode(effectiveCenter.lat, effectiveCenter.lng);
            }}
            className="shrink-0 rounded-md border border-border px-2 py-2 text-sm min-h-9 font-bold hover:bg-muted"
          >
            Confirm pin
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
    </div>
  );
}

function LeafletMap({
  center,
  zoom,
  onPick,
  marker,
  onReady,
}: {
  center: LatLng;
  zoom: number;
  onPick: (lat: number, lng: number) => void;
  marker: LatLng | null;
  onReady: () => void;
}) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);
  if (!isClient) return <div className="h-full w-full bg-muted" />;

  return <ClientLeaflet center={center} zoom={zoom} onPick={onPick} marker={marker} onReady={onReady} />;
}

function ClientLeaflet({
  center,
  zoom,
  onPick,
  marker,
  onReady,
}: {
  center: LatLng;
  zoom: number;
  onPick: (lat: number, lng: number) => void;
  marker: LatLng | null;
  onReady: () => void;
}) {
  // Dynamic import to avoid SSR issues with leaflet css
  const [L, setL] = useState<typeof import("leaflet") | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((mod) => {
      if (cancelled) return;
      // Fix default icon paths for Vite
      // @ts-expect-error - leaflet types
      delete mod.Icon.Default.prototype._getIconUrl;
      mod.Icon.Default.mergeOptions({
        iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).href,
        iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).href,
        shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).href,
      });
      setL(mod);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!L || !containerRef.current) return;
    if (mapRef.current) return;

    // Ensure container has size
    const map = L.map(containerRef.current, { zoomControl: false }).setView([center.lat, center.lng], zoom);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19,
    }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onPick(e.latlng.lat, e.latlng.lng);
    });

    map.whenReady(() => onReady());
    mapRef.current = map;

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [L]);

  // Keep map centered when center changes (e.g., picking suggestion)
  useEffect(() => {
    if (!mapRef.current || !L) return;
    mapRef.current.setView([center.lat, center.lng], marker ? 15 : zoom);
  }, [center.lat, center.lng, L, marker, zoom]);

  // Marker management
  useEffect(() => {
    if (!L || !mapRef.current) return;
    const map = mapRef.current;
    if (!marker) {
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      return;
    }
    if (!markerRef.current) {
      const m = L.marker([marker.lat, marker.lng], { draggable: true }).addTo(map);
      m.on("dragend", () => {
        const ll = m.getLatLng();
        onPick(ll.lat, ll.lng);
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([marker.lat, marker.lng]);
    }
  }, [L, marker, onPick]);

  // Invalidate size after mount (fixes grey tiles when inside dialog)
  useEffect(() => {
    const t = setTimeout(() => mapRef.current?.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, []);

  // Also invalidate when marker/center changes and when container resizes
  useEffect(() => {
    const ro = new ResizeObserver(() => mapRef.current?.invalidateSize());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return <div ref={containerRef} className="h-full w-full" />;
}
