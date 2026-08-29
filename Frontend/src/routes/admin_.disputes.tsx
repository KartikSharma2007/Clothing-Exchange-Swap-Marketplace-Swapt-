import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Coins, ImagePlus, Loader2, Scale } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Btn, Chips, Empty, Field, Modal, Pill, Table, Toolbar, inputClass } from "@/components/admin/ui";
import { fetchAdminDisputes, resolveDispute, type AdminDispute, type DisputeOutcome } from "@/lib/moderation-api";

export const Route = createFileRoute("/admin_/disputes")({
  head: () => ({
    meta: [
      { title: "Swap disputes — Swapt admin" },
      { name: "description", content: "Review and resolve swap disputes." },
      { property: "og:title", content: "Swapt swap disputes" },
      { property: "og:description", content: "Review and resolve swap disputes." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: DisputesPage,
});

const STATUSES = ["open", "resolved", "all"] as const;

const OUTCOME_OPTIONS: { value: DisputeOutcome; label: string; hint: string }[] = [
  { value: "none", label: "No credits moved", hint: "Close without moving escrow." },
  { value: "refund_requester", label: "Refund requester", hint: "Return escrowed credits to the requester and cancel the swap." },
  { value: "release_owner", label: "Release to owner", hint: "Release escrowed credits to the owner and mark the swap complete." },
];

const OUTCOME_LABEL: Record<DisputeOutcome, string> = {
  none: "No credits moved",
  refund_requester: "Refunded requester",
  release_owner: "Released to owner",
};

function DisputesPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("open");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<AdminDispute | null>(null);
  const [note, setNote] = useState("");
  const [outcome, setOutcome] = useState<DisputeOutcome>("none");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "disputes", status, page],
    queryFn: () => fetchAdminDisputes({ status, page }),
  });

  const resolve = useMutation({
    mutationFn: () => resolveDispute(resolving!.id, { note, outcome }),
    onSuccess: () => {
      setResolving(null);
      setNote("");
      setOutcome("none");
      void qc.invalidateQueries({ queryKey: ["admin", "disputes"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  const rows = data?.items ?? [];
  const pages = data?.pages ?? 1;

  return (
    <AdminLayout title="Swap disputes" subtitle="Mediate swaps that went wrong">
      <Toolbar>
        <Chips options={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        <span className="ml-auto text-xs text-foreground/50">{data?.total ?? 0} dispute(s)</span>
      </Toolbar>

      {isLoading ? (
        <div className="grid place-items-center py-16 text-sm text-foreground/50">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Empty label={status === "resolved" ? "No resolved disputes yet" : "🎉 No open disputes"} />
      ) : (
        <div className="space-y-4">
          <Table
            head={["Item", "Reason", "Opened by", "Participants", "When", ""]}
            children={rows.map((d) => (
              <tr key={d.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td data-label="Item" className="px-3 py-3 text-sm">
                  <div className="font-semibold">{d.listingTitle ?? "Deleted listing"}</div>
                  <div className="text-xs text-foreground/50">swap #{d.swapId.slice(-6)} · {d.swapStatus}</div>
                  {d.evidence.length > 0 && (
                    <div className="mt-1.5 flex gap-1">
                      {d.evidence.slice(0, 4).map((ev, i) => (
                        <a key={ev.publicId || i} href={ev.url ?? "#"} target={ev.url ? "_blank" : undefined} rel="noreferrer" className="overflow-hidden rounded border border-border bg-white" aria-label={`Evidence ${i + 1}`}>
                          <img src={ev.url ?? ""} alt={`Dispute evidence ${i + 1}`} className="h-8 w-8 object-cover" />
                        </a>
                      ))}
                      {d.evidence.length > 4 && <span className="grid h-8 w-8 place-items-center rounded border border-border bg-muted text-xs font-bold text-foreground/60">+{d.evidence.length - 4}</span>}
                    </div>
                  )}
                </td>
                <td data-label="Reason" className="px-3 py-3 text-sm">
                  <span className="font-medium">{d.reason}</span>
                  {d.description && <div className="mt-0.5 max-w-xs truncate text-xs text-foreground/50" title={d.description}>{d.description}</div>}
                  {d.escrow && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700">
                      <Coins className="h-3 w-3" /> escrow {d.escrow.amount}
                    </span>
                  )}
                </td>
                <td data-label="Opened by" className="px-3 py-3 text-sm">@{d.openedBy}</td>
                <td data-label="Participants" className="px-3 py-3 text-sm text-foreground/70">{d.participants.map((p) => `@${p}`).join(", ")}</td>
                <td data-label="When" className="px-3 py-3 text-sm text-foreground/60">{new Date(d.createdAt).toLocaleDateString()}</td>
                <td data-label="" className="px-3 py-3 text-right">
                  {d.status === "open" ? (
                    <Btn onClick={() => { setResolving(d); setNote(""); setOutcome("none"); }}>Review</Btn>
                  ) : (
                    <span className="inline-flex flex-col items-end gap-1">
                      <Pill tone="good">resolved</Pill>
                      <span className="text-xs text-foreground/50">{OUTCOME_LABEL[d.outcome ?? "none"]}</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          />

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2 text-sm">
              <Btn disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Prev</Btn>
              <span className="text-foreground/50">Page {page} of {pages}</span>
              <Btn disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next →</Btn>
            </div>
          )}
        </div>
      )}

      {resolving && (
        <Modal title="Resolve dispute" onClose={() => setResolving(null)}>
          <div className="space-y-4 text-sm">
            <div>
              <p className="text-foreground/70">
                <Scale className="mr-1 inline h-4 w-4" />
                <span className="font-semibold">{resolving.listingTitle ?? "Deleted listing"}</span>
                {" — "}{resolving.reason}
              </p>
              {resolving.description && (
                <p className="mt-2 rounded-lg bg-muted p-3 text-foreground/70">“{resolving.description}”</p>
              )}
            </div>

            {resolving.timeline.length > 0 && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-foreground/50">Timeline</p>
                <ol className="mt-2 space-y-1.5">
                  {resolving.timeline.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-foreground/70">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span className="min-w-0">
                        <span className="font-bold capitalize">{t.actor}</span>{" "}
                        {t.note || t.action}
                        <span className="block text-xs text-foreground/40">{new Date(t.at).toLocaleString()}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {resolving.evidence.length > 0 && (
              <div>
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-foreground/50">
                  <ImagePlus className="h-3.5 w-3.5" /> Evidence ({resolving.evidence.length})
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {resolving.evidence.map((ev, i) => (
                    <a
                      key={ev.publicId || i}
                      href={ev.url ?? "#"}
                      target={ev.url ? "_blank" : undefined}
                      rel="noreferrer"
                      className="overflow-hidden rounded-lg border border-border bg-white transition-opacity hover:opacity-90"
                      aria-label={`Open evidence ${i + 1}`}
                    >
                      <img src={ev.url ?? ""} alt={`Dispute evidence ${i + 1}`} className="aspect-square w-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )}

            {resolving.escrow && (
              <p className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700">
                <Coins className="h-3.5 w-3.5" /> {resolving.escrow.amount} credits held in escrow — your outcome decides where they go.
              </p>
            )}

            <Field label="Resolution note (visible to audit trail)">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="How was this mediated?" rows={3} className={inputClass} />
            </Field>

            <Field label="Outcome">
              <div className="space-y-2">
                {OUTCOME_OPTIONS.map((o) => (
                  <label key={o.value} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${outcome === o.value ? "border-brand bg-brand/5" : "border-border hover:bg-muted/40"}`}>
                    <input
                      type="radio"
                      name="dispute-outcome"
                      checked={outcome === o.value}
                      onChange={() => setOutcome(o.value)}
                      className="mt-0.5 accent-brand"
                    />
                    <span>
                      <span className="block text-xs font-bold">{o.label}</span>
                      <span className="block text-xs text-foreground/55">{o.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Btn onClick={() => setResolving(null)}>Cancel</Btn>
              <Btn variant="ghost" disabled={resolve.isPending} onClick={() => resolve.mutate()}>
                {resolve.isPending ? "Resolving…" : "Resolve dispute"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}