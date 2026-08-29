import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Btn, Chips, Empty, Field, Modal, Pill, Table, Toolbar, inputClass } from "@/components/admin/ui";
import { fetchAdminReports, resolveReport, type AdminReport } from "@/lib/moderation-api";

export const Route = createFileRoute("/admin_/reports")({
  head: () => ({
    meta: [
      { title: "Moderation queue — Swapt admin" },
      { name: "description", content: "Review and act on user and listing reports." },
      { property: "og:title", content: "Swapt moderation queue" },
      { property: "og:description", content: "Review and act on user and listing reports." },
      { property: "og:type", content: "website" },
    ],
  }),
  component: ReportsPage,
});

const STATUSES = ["open", "resolved", "all"] as const;
const TYPES = ["all", "listing", "user"] as const;

const REASON_LABEL: Record<string, string> = {
  counterfeit: "Counterfeit",
  prohibited: "Prohibited item",
  misleading: "Misleading",
  damaged: "Damaged on arrival",
  unavailable: "Unavailable",
  harassment: "Harassment",
  scam: "Scam",
  inappropriate: "Inappropriate",
  spam: "Spam",
  other: "Other",
};

function ReportsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("open");
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [page, setPage] = useState(1);
  const [resolving, setResolving] = useState<AdminReport | null>(null);
  const [note, setNote] = useState("");
  const [action, setAction] = useState<"none" | "hide_listing" | "delete_listing" | "suspend_user">("none");
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reports", status, type, page],
    queryFn: () => fetchAdminReports({ status, type, page }),
  });

  const resolve = useMutation({
    mutationFn: () => resolveReport(resolving!.id, { note, action }),
    onSuccess: () => {
      setResolving(null);
      setNote("");
      setAction("none");
      void qc.invalidateQueries({ queryKey: ["admin", "reports"] });
      void qc.invalidateQueries({ queryKey: ["admin", "overview"] });
    },
  });

  const rows = data?.items ?? [];
  const pages = data?.pages ?? 1;

  return (
    <AdminLayout
      title="Moderation queue"
      subtitle="Review and act on reports from the community"
    >
      <Toolbar>
        <Chips options={STATUSES} value={status} onChange={(v) => { setStatus(v); setPage(1); }} />
        <Chips options={TYPES} value={type} onChange={(v) => { setType(v); setPage(1); }} />
        <span className="ml-auto text-xs text-foreground/50">{data?.total ?? 0} report(s)</span>
      </Toolbar>

      {isLoading ? (
        <div className="grid place-items-center py-16 text-sm text-foreground/50">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Empty label={status === "resolved" ? "No resolved reports yet" : "🎉 Queue is clear — no open reports"} />
      ) : (
        <div className="space-y-4">
          <Table
            head={["Reported", "Type", "Reason", "From", "When", ""]}
            children={rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                <td data-label="Reported" className="px-3 py-3 text-sm">
                  <div className="font-semibold">{r.target?.title ?? r.target?.name ?? r.target?.username ?? "Deleted"}</div>
                  {r.target?.seller && <div className="text-xs text-foreground/50">by @{r.target.seller}</div>}
                </td>
                <td data-label="Type" className="px-3 py-3"><Pill tone={r.targetType === "listing" ? "info" : "warn"}>{r.targetType}</Pill></td>
                <td data-label="Reason" className="px-3 py-3 text-sm">
                  <span className="font-medium">{REASON_LABEL[r.reason] ?? r.reason}</span>
                  {r.details && <div className="mt-0.5 max-w-xs truncate text-xs text-foreground/50" title={r.details}>{r.details}</div>}
                </td>
                <td data-label="From" className="px-3 py-3 text-sm">@{r.reporter}</td>
                <td data-label="When" className="px-3 py-3 text-sm text-foreground/60">{new Date(r.createdAt).toLocaleDateString()}</td>
                <td data-label="" className="px-3 py-3 text-right">
                  {r.status === "open" ? (
                    <Btn onClick={() => { setResolving(r); setNote(""); setAction("none"); }}>Review</Btn>
                  ) : (
                    <Pill tone="good">resolved</Pill>
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
        <Modal title="Resolve report" onClose={() => setResolving(null)}>
          <div className="space-y-3 text-sm">
            <p className="text-foreground/70">
              <ShieldAlert className="mr-1 inline h-4 w-4" />
              <span className="font-semibold">{resolving.target?.title ?? resolving.target?.name ?? "Target"}</span>
              {resolving.target?.seller && <span className="text-foreground/50"> · by @{resolving.target.seller}</span>}
              {" — "}{REASON_LABEL[resolving.reason] ?? resolving.reason}
            </p>
            {resolving.details && (
              <p className="rounded-lg bg-muted p-3 text-foreground/70">“{resolving.details}”</p>
            )}

            <Field label="Action">
              <select value={action} onChange={(e) => setAction(e.target.value as typeof action)} className={inputClass}>
                <option value="none">No action — dismiss</option>
                <option value="hide_listing">Hide listing</option>
                <option value="delete_listing">Delete listing</option>
                <option value="suspend_user">
                  {resolving.targetType === "listing" ? "Suspend seller account" : "Suspend user account"}
                </option>
              </select>
            </Field>
            <Field label="Note (visible to audit trail)">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional summary…" className={inputClass} />
            </Field>

            <div className="flex justify-end gap-2 pt-1">
              <Btn onClick={() => setResolving(null)}>Cancel</Btn>
              <Btn variant="ghost" disabled={busy || resolve.isPending} onClick={() => { setBusy(true); resolve.mutate(undefined, { onSettled: () => setBusy(false) }); }}>
                {resolve.isPending ? "Resolving…" : "Resolve report"}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
    </AdminLayout>
  );
}