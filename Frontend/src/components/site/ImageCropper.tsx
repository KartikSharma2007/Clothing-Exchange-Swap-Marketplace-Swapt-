import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useModalDialog } from "@/lib/dialog-a11y";

type Props = {
  open: boolean;
  src: string;
  aspect?: "4:5" | "1:1";
  onCancel: () => void;
  onApply: (file: File) => void;
};

/**
 * Minimal pan/zoom cropper. The photo is shown "cover-fit" inside a fixed
 * frame; drag to pan, scroll / slider to zoom. "Apply" rasterises the visible
 * region to a JPEG at ~800px wide — small enough for the multipart upload.
 */
export default function ImageCropper({ open, src, aspect = "4:5", onCancel, onApply }: Props) {
  const dialogRef = useModalDialog(open, onCancel);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const cw = aspect === "1:1" ? (isMobile ? Math.min(280, Math.floor(window.innerWidth * 0.85)) : 320) : (isMobile ? Math.min(280, Math.floor(window.innerWidth * 0.85)) : 320);
  const ch = aspect === "1:1" ? cw : Math.round(cw * 1.25);

  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
    const img = new Image();
    img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => setError("Couldn't read that image.");
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [open, src]);

  const fit = useMemo(() => {
    if (!natural.w || !natural.h) return null;
    const base = Math.max(cw / natural.w, ch / natural.h);
    const scale = base * zoom;
    const dispW = natural.w * scale;
    const dispH = natural.h * scale;
    const maxX = Math.max(0, (dispW - cw) / 2);
    const maxY = Math.max(0, (dispH - ch) / 2);
    const ox = Math.max(-maxX, Math.min(maxX, offset.x));
    const oy = Math.max(-maxY, Math.min(maxY, offset.y));
    return { base, scale, dispW, dispH, maxX, maxY, ox, oy };
  }, [natural, zoom, offset, cw, ch]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }, [offset]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.startX),
      y: dragRef.current.oy + (e.clientY - dragRef.current.startY),
    });
  }, []);

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((z) => Math.max(1, Math.min(4, z + (e.deltaY > 0 ? -0.12 : 0.12))));
  }, []);

  const apply = useCallback(() => {
    const img = imageRef.current;
    if (!img || !fit) return;
    const { scale, ox, oy } = fit;
    // Visible rect in natural-image coordinates.
    const left = cw / 2 - (natural.w * scale) / 2 + ox;
    const top = ch / 2 - (natural.h * scale) / 2 + oy;
    const sx = Math.max(0, -left / scale);
    const sy = Math.max(0, -top / scale);
    const sw = cw / scale;
    const sh = ch / scale;
    const outW = 800;
    const outH = Math.max(1, Math.round(outW * (ch / cw)));
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
    canvas.toBlob((blob) => {
      if (!blob) return;
      onApply(new File([blob], "cropped.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  }, [fit, natural, cw, ch, onApply]);

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Crop photo"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-900">Crop photo</h3>
          <div className="flex gap-2 text-xs font-medium">
            {aspect === "1:1" ? (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">Square</span>
            ) : (
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-500">Cover</span>
            )}
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto cursor-grab touch-none overflow-hidden rounded-xl bg-neutral-100 select-none active:cursor-grabbing max-md:cursor-grab max-md:touch-pan-y"
          style={{ width: "min(100%, 320px)", height: cw === ch ? "min(320px, 60vw)" : "min(400px, 70vw)", maxWidth: cw, maxHeight: ch }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          onWheel={onWheel}
        >
          {error ? (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-red-500">{error}</div>
          ) : (
            fit && (
              <img
                ref={imageRef}
                src={src}
                alt="Crop preview"
                className="pointer-events-none absolute"
                style={{
                  width: fit.dispW,
                  height: fit.dispH,
                  left: cw / 2 - fit.dispW / 2 + fit.ox,
                  top: ch / 2 - fit.dispH / 2 + fit.oy,
                }}
              />
            )
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 px-1 max-md:gap-3 max-md:mt-4">
          <span className="text-xs text-neutral-500 max-md:text-sm max-md:font-bold">−</span>
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full max-md:h-11 max-md:py-2 accent-black touch-manipulation"
            aria-label="Zoom"
          />
          <span className="text-xs text-neutral-500 max-md:text-sm max-md:font-bold">+</span>
        </div>

        <div className="mt-4 flex justify-end gap-2 max-md:gap-3 max-md:mt-6">
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100 max-md:min-h-11 max-md:px-5 max-md:py-2.5 max-md:rounded-xl max-md:border max-md:border-border max-md:bg-white">
            Cancel
          </button>
          <button type="button" onClick={apply} className="rounded-lg bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 max-md:min-h-11 max-md:px-6 max-md:py-2.5 max-md:rounded-xl max-md:font-bold">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}