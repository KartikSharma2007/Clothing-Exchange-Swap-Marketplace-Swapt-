/**
 * Local autosave for the "List an item" form. Fields are persisted debounced
 * while typing; photos are stored as small data URLs so a full draft can be
 * restored even after a refresh or an accidental navigation.
 */

export type DraftCoords = { lat: string; lng: string };

export type ListingDraft = {
  /** Controlled React state fields (text inputs + selects). */
  fields: Record<string, string>;
  /** Uncontrolled form inputs by `name`, captured straight from the FormData. */
  form: Record<string, string>;
  measurements: Record<string, string>;
  meetup: boolean;
  coords: DraftCoords;
  /** Photos as compressed data URLs (≤ 512px) so the draft stays tiny. */
  images: string[];
  savedAt: string;
};

const DRAFT_KEY = "swapt.listing-draft";

export function saveDraft(draft: ListingDraft): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Quota exceeded (very large image set) — keep whatever was saved before.
  }
}

export function loadDraft(): ListingDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ListingDraft;
    if (!parsed || typeof parsed.savedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** Compress an image to a small data URL for draft persistence. */
export function fileToDataUrl(file: File, max = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Canvas isn't supported in this browser."));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return reject(new Error("Couldn't process the image."));
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Couldn't read the image."));
        reader.readAsDataURL(blob);
      }, "image/jpeg", 0.8);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that image."));
    };
    img.src = url;
  });
}

/** Turn a stored data URL back into a File the sell form can use. */
export function dataUrlToFile(dataUrl: string, name: string): File {
  const [meta, base64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(meta)?.[1] ?? "image/jpeg";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}