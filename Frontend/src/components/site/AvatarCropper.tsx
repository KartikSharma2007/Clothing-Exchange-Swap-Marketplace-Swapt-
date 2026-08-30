import { useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut } from "lucide-react";

const CROP_PREVIEW = 280;
const CROP_EXPORT = 512;

function clampCrop(crop: { x: number; y: number; size: number }, natW: number, natH: number) {
  const size = Math.min(crop.size, natW, natH);
  const x = Math.min(Math.max(crop.x, 0), Math.max(natW - size, 0));
  const y = Math.min(Math.max(crop.y, 0), Math.max(natH - size, 0));
  return { x, y, size };
}

/** Max upload size accepted before this modal is even opened — kept in sync with the backend's Multer limit. */
export const AVATAR_MAX_BYTES = 8 * 1024 * 1024;
export const AVATAR_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * Client-side validation for a picked avatar file, run BEFORE the crop modal
 * opens. Returns a specific, human-readable error, or null if the file is fine.
 * Shared by every avatar-upload entry point so the message is consistent.
 */
export function validateAvatarFile(f: File): string | null {
  if (f.size > AVATAR_MAX_BYTES) return "Image must be under 8 MB.";
  if (!AVATAR_ALLOWED_TYPES.includes(f.type)) return "Only JPEG, PNG, WebP or AVIF images are allowed.";
  return null;
}

/** Square crop modal — drag to pan, slider to zoom, exports a 512px JPEG. */
export function AvatarCropper({
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