import { useEffect, type ReactNode } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { useModalDialog } from "@/lib/dialog-a11y";

type Props = {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Tone of the confirm button. */
  variant?: "danger" | "brand" | "neutral";
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

/**
 * Accessible confirmation pop-up used instead of window.confirm — keyboard
 * (Esc to cancel, Enter to confirm), labelled, with a designed look.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const dialogRef = useModalDialog(open, onClose);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !busy) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onConfirm]);

  if (!open) return null;

  const tones =
    variant === "danger"
      ? "bg-rose-600 hover:bg-rose-700"
      : variant === "brand"
        ? "bg-gradient-to-r from-brand to-brand/85 hover:shadow-lg"
        : "bg-foreground hover:bg-foreground/90";

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-[60] grid place-items-center bg-background/60 p-4 backdrop-blur-sm animate-fade-in outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm animate-scale-in rounded-3xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
              variant === "danger" ? "bg-rose-100 text-rose-600" : variant === "brand" ? "bg-brand/10 text-brand" : "bg-muted text-foreground/70"
            }`}
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-black tracking-tight text-foreground">{title}</h2>
            {description && <div className="mt-1 text-sm text-foreground/60">{description}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground/70 transition-colors hover:bg-muted disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60 ${tones}`}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}