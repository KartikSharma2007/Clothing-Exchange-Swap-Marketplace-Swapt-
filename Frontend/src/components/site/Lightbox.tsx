import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from "lucide-react";
import { useModalDialog } from "@/lib/dialog-a11y";

type Props = {
  images: string[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Fullscreen photo viewer. Click the main image to zoom, drag to pan when
 * zoomed in, scroll / buttons to zoom, arrows to step through photos.
 */
export default function Lightbox({ images, index, onClose, onIndexChange }: Props) {
  const src = images[index];
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [nat, setNat] = useState({ w: 0, h: 0 });

  // Focus trap, Escape to close, focus restore, and keyboard prev/next.
  const dialogRef = useModalDialog(true, onClose);

  useEffect(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);

  const onKeys = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && index > 0) onIndexChange(index - 1);
      else if (e.key === "ArrowRight" && index < images.length - 1) onIndexChange(index + 1);
    },
    [index, images.length, onIndexChange],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKeys);
    return () => window.removeEventListener("keydown", onKeys);
  }, [onKeys]);

  const view = useMemo(() => {
    const el = wrapRef.current;
    if (!el || !nat.w || !nat.h) return null;
    const dw = el.clientWidth;
    const dh = el.clientHeight;
    const base = Math.min(dw / nat.w, dh / nat.h);
    const scale = base * zoom;
    const dispW = nat.w * scale;
    const dispH = nat.h * scale;
    const maxX = Math.max(0, (dispW - dw) / 2);
    const maxY = Math.max(0, (dispH - dh) / 2);
    return {
      dispW, dispH, dw, dh,
      ox: clamp(offset.x, -maxX, maxX),
      oy: clamp(offset.y, -maxY, maxY),
    };
  }, [nat, zoom, offset]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Let clicks on the prev/next buttons pass through — capturing the pointer
    // here would retarget the click to the stage and swallow the button press.
    if ((e.target as HTMLElement).closest("button")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (e.clientX - dragRef.current.x),
      y: dragRef.current.oy + (e.clientY - dragRef.current.y),
    });
  };
  const endDrag = () => { dragRef.current = null; };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setZoom((z) => clamp(z + (e.deltaY < 0 ? 0.25 : -0.25), 1, 5));
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
    >
      {/* Top bar */}
      <div className="flex items-center justify-between p-3 sm:p-4">
        <span className="rounded-full bg-white/10 px-3 py-2 text-sm min-h-9 font-bold text-white">
          {index + 1} / {images.length}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(z * 1.5, 1, 5))}
            aria-label="Zoom in"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            aria-label="Reset zoom"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close viewer"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-rose-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stage */}
      <div
        ref={wrapRef}
        className="relative flex-1 touch-none overflow-hidden select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onWheel={onWheel}
      >
        {view && (
          <img
            src={src}
            alt="Listing photo"
            draggable={false}
            className="absolute cursor-grab active:cursor-grabbing"
            style={{
              width: view.dispW,
              height: view.dispH,
              left: view.dw / 2 - view.dispW / 2 + view.ox,
              top: view.dh / 2 - view.dispH / 2 + view.oy,
            }}
          />
        )}

        {index > 0 && (
          <button
            type="button"
            onClick={() => onIndexChange(index - 1)}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            onClick={() => onIndexChange(index + 1)}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Thumbnails */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 overflow-x-auto p-3 sm:p-4">
          {images.map((thumb, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onIndexChange(i)}
              aria-label={`View photo ${i + 1}`}
              className={i === index ? "ring-2 ring-white" : "opacity-60 hover:opacity-100"}
            >
              <img src={thumb} alt="" className="h-14 w-14 rounded-lg object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}