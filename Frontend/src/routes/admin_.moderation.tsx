import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Btn, Empty, Pagination, Modal } from "@/components/admin/ui";
import { fetchModerationQueue, reviewModerationListing, type ModerationQueueItem } from "@/lib/admin-api";
import { Shield, Check, X, Eye } from "lucide-react";

export const Route = createFileRoute("/admin_/moderation")({
  component: ModerationPage,
});

function ModerationPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "moderation", page], queryFn: () => fetchModerationQueue(page) });
  const [review, setReview] = useState<ModerationQueueItem | null>(null);
  const [note, setNote] = useState("");

  const mutate = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: "approve" | "reject" | "hide"; note: string }) => reviewModerationListing(id, action, note),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin", "moderation"] }); setReview(null); setNote(""); },
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <AdminLayout title="Proactive moderation" subtitle={`${total} flagged · AI + keyword scan before items go live. Approve to publish, reject to hide.`}>
      {isLoading ? <Empty label="Loading flagged listings…" /> : items.length === 0 ? <Empty label="No flagged listings — all clear." /> : (
        <>
          <div className="grid gap-4">
            {items.map((l) => (
              <div key={l.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex gap-4">
                  <img src={l.images[0]} alt={l.title} className="h-20 w-20 rounded-xl object-cover border border-border shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold truncate">{l.title || "(untitled draft)"}</h3>
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">Score {l.moderationScore}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{l.status}{l.publishAt ? ` · scheduled ${new Date(l.publishAt).toLocaleString()}` : ""}</span>
                      {l.moderationStatus === "flagged" && <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 flex items-center gap-1"><Shield className="h-3 w-3" /> Flagged</span>}
                    </div>
                    <p className="text-xs text-foreground/60 mt-1">{l.brand} · {l.category} · {l.size} · {l.condition} · {l.value} cr</p>
                    <p className="text-xs mt-1 line-clamp-2 text-foreground/70">{l.description || "— no description —"}</p>
                    <p className="text-xs mt-1 text-rose-600 font-medium">Reason: {l.moderationReason || "—"}</p>
                    <p className="text-xs text-foreground/50">Seller: {l.seller?.name} @{l.seller?.username} · Flagged {l.flaggedAt ? new Date(l.flaggedAt).toLocaleString() : l.createdAt}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn onClick={() => setReview(l)}>Review</Btn>
                  <a href={`/listing/${l.id}`} target="_blank" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-2 text-sm min-h-9 font-semibold hover:bg-muted"><Eye className="h-3 w-3" /> View</a>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-center">
            <Pagination page={page} pages={data?.pages ?? 1} onPage={setPage} />
          </div>
        </>
      )}
      {review && (
        <Modal title={`Review: ${review.title}`} onClose={() => setReview(null)}>
          <p className="text-sm text-foreground/70">Seller: {review.seller?.name} · Score {review.moderationScore}</p>
          <p className="mt-2 text-sm font-medium text-rose-700">Flag reason: {review.moderationReason}</p>
          <label className="block mt-3">
            <span className="text-xs font-semibold">Note for audit log (optional)</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-border px-3 py-2 text-sm" placeholder="Why approve or reject?" />
          </label>
          <div className="mt-4 flex flex-wrap gap-2">
            <button disabled={mutate.isPending} onClick={() => mutate.mutate({ id: review.id, action: "approve", note })} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"><Check className="h-4 w-4" /> Approve & publish</button>
            <button disabled={mutate.isPending} onClick={() => mutate.mutate({ id: review.id, action: "reject", note })} className="inline-flex items-center gap-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"><X className="h-4 w-4" /> Reject & hide</button>
            <button onClick={() => setReview(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
          </div>
          <p className="mt-3 text-xs text-foreground/50">Approve makes it visible in browse; reject hides it and keeps it flagged. The seller is not auto-notified beyond audit log — add notify if needed.</p>
        </Modal>
      )}
    </AdminLayout>
  );
}
