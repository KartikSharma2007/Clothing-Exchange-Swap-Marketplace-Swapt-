import { useState } from "react";
import { X, Flag } from "lucide-react";
import { reportTarget, type ReportTargetType } from "@/lib/moderation-api";
import { toast } from "sonner";
import { useModalDialog } from "@/lib/dialog-a11y";

const REASONS: Record<ReportTargetType, { value: string; label: string }[]> = {
  listing: [
    { value: "counterfeit", label: "Counterfeit or fake" },
    { value: "prohibited", label: "Prohibited item" },
    { value: "misleading", label: "Misleading description" },
    { value: "damaged", label: "Arrived damaged / not as described" },
    { value: "unavailable", label: "No longer available" },
    { value: "other", label: "Something else" },
  ],
  user: [
    { value: "harassment", label: "Harassment or bullying" },
    { value: "scam", label: "Scam or fraud attempt" },
    { value: "inappropriate", label: "Inappropriate content" },
    { value: "spam", label: "Spam or fake account" },
    { value: "other", label: "Something else" },
  ],
};

export function ReportDialog({
  targetType,
  targetId,
  onClose,
}: {
  targetType: ReportTargetType;
  targetId: string;
  onClose: () => void;
}) {
  const [reason, setReason] = useState(REASONS[targetType][0].value);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const dialogRef = useModalDialog(true, onClose);

  const submit = async () => {
    if (sending) return;
    setSending(true);
    try {
      await reportTarget({ targetType, targetId, reason, details: details.trim() });
      toast.success("Thanks — our moderation team will review this.");
      onClose();
    } catch {
      toast.error("Couldn't send the report. Please try again.");
      setSending(false);
    }
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 grid place-items-center bg-background/60 p-4 backdrop-blur-sm outline-none"
      role="dialog"
      aria-modal="true"
      aria-label={`Report this ${targetType}`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-bold">
            <Flag className="h-4 w-4 text-rose-500" /> Report this {targetType}
          </h3>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1 text-foreground/60 hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground/50">Reason</label>
        <div className="mb-3 grid gap-1.5">
          {REASONS[targetType].map((r) => (
            <label
              key={r.value}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                reason === r.value ? "border-brand bg-brand/5 text-foreground" : "border-border hover:bg-muted"
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              {r.label}
            </label>
          ))}
        </div>

        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-foreground/50">Details (optional)</label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Tell us what happened so we can look into it…"
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand/60"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={sending}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Submit report"}
          </button>
        </div>
      </div>
    </div>
  );
}
