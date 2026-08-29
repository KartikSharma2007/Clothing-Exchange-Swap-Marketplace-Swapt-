import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Btn, Chips, Empty, Field, Modal, Pagination, Pill, SearchInput, Table, Toolbar, inputClass, statusTone } from "@/components/admin/ui";
import { fetchUserDetails, fetchUserDetailsBatch, fetchUsers, updateUserStatus, type UserQuery } from "@/lib/admin-api";
import type { AdminUser } from "@/lib/admin-api";

export const Route = createFileRoute("/admin_/users")({
  head: () => ({
    meta: [
      { title: "User management — Swapt admin" },
      { name: "description", content: "View users and manage their account status (suspend/restore)." },
      { property: "og:title", content: "Swapt user management" },
      { property: "og:description", content: "View and manage user account status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UsersPage,
});

const STATUSES = ["all", "active", "suspended"] as const;

function Avatar({ url, name, sizeClass = "h-10 w-10" }: { url?: string | null; name: string; sizeClass?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <div className={`${sizeClass} grid place-items-center rounded-full bg-brand/10 text-sm font-black text-brand`}>{name.slice(0, 2).toUpperCase()}</div>
    );
  }
  return <img src={url} alt={`${name} avatar`} className={`${sizeClass} rounded-full object-cover`} onError={() => setFailed(true)} />;
}

function UsersPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState<UserQuery>({ q: "", status: "all" });
  const [detail, setDetail] = useState<AdminUser | null>(null);
  const [confirm, setConfirm] = useState<{ user: AdminUser; targetStatus: "active" | "suspended" } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "users", query], queryFn: () => fetchUsers(query) });

  const suspendMutation = useMutation({
    mutationFn: ({ userId, status, reason }: { userId: string; status: "suspended" | "active"; reason: string }) =>
      updateUserStatus(userId, status, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  const rows = data?.users ?? [];
  const [avatars, setAvatars] = useState<Record<string, string | null>>({});

  // Fetch missing avatarUrls for rows when API doesn't return them in the list endpoint

  useEffect(() => {
    let mounted = true;
    async function load() {
      const missing = rows.filter((u) => !u.avatarUrl && !(u.id in avatars));
      if (missing.length === 0) return;
      try {
        const ids = missing.map((u) => u.id);
        const res = await fetchUserDetailsBatch(ids);
        const map: Record<string, string | null> = {};
        for (const u of res.users) {
          map[u.id] = u.avatarUrl ?? null;
        }
        // Ensure any ids not returned are marked null to avoid refetch loops
        for (const id of ids) {
          if (!(id in map)) map[id] = null;
        }
        if (!mounted) return;
        setAvatars((prev) => ({ ...prev, ...map }));
      } catch {
        // fallback: mark missing as null to avoid repeated retries
        const map: Record<string, string | null> = {};
        for (const u of missing) map[u.id] = null;
        if (!mounted) return;
        setAvatars((prev) => ({ ...prev, ...map }));
      }
    }
    load();
    return () => { mounted = false; };
  }, [rows.map((r) => r.id).join("," ), Object.keys(avatars).join(",")]);

  const total = data?.total ?? 0;
  const page = data?.page ?? 1;
  const pages = data?.pages ?? 1;

  const goPage = (p: number) => {
    setQuery((prev) => ({ ...prev, page: p }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AdminLayout title="User management" subtitle={`${total} total accounts · Showing ${rows.length} of ${total} (page ${page} of ${pages})`}>
      <Toolbar>
        <SearchInput value={query.q} onChange={(q) => setQuery((prev) => ({ ...prev, q, page: 1 }))} placeholder="Search name, username or email…" />
        <Chips options={STATUSES} value={query.status} onChange={(status) => setQuery((prev) => ({ ...prev, status: status as UserQuery["status"], page: 1 }))} />
      </Toolbar>

      {isLoading ? (
        <Empty label="Loading members…" />
      ) : rows.length === 0 ? (
        <Empty label="No users match those filters." />
      ) : (
        <>
          <Table head={["Member", "Status", "Created", "Actions"]}>
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td data-label="Member" className="px-3 py-2.5">
                  <div className="flex items-center gap-3">
                    <Avatar url={avatars[u.id] ?? u.avatarUrl} name={u.name} sizeClass="h-10 w-10" />
                    <div>
                      <button onClick={() => setDetail(u)} className="text-left">
                        <span className="block font-semibold hover:underline">{u.name}</span>
                        <span className="block text-xs text-foreground/55">@{u.username}</span>
                        <span className="block text-xs text-foreground/55">{u.email}</span>
                      </button>
                    </div>
                  </div>
                </td>
                <td data-label="Status" className="px-3 py-2.5">
                  <Pill tone={statusTone(u.status)}>{u.status}</Pill>
                </td>
                <td data-label="Created" className="px-3 py-2.5 whitespace-nowrap text-xs text-foreground/55">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td data-label="Actions" className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Btn onClick={() => setDetail(u)}>See details</Btn>
                    {u.status === "active" ? (
                      <Btn onClick={() => setConfirm({ user: u, targetStatus: "suspended" })}>Suspend</Btn>
                    ) : (
                      <Btn variant="solid" onClick={() => setConfirm({ user: u, targetStatus: "active" })}>Restore</Btn>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pages={pages} onPage={goPage} />
        </>
      )}

      {confirm && (
        <Modal title={confirm.targetStatus === "suspended" ? "Suspend user" : "Restore user"} onClose={() => setConfirm(null)}>
          <p className="text-sm text-foreground/70">Member: <span className="font-semibold">{confirm.user.name} (@{confirm.user.username})</span></p>
          <label className="block mt-4">
            <span className="block text-xs font-semibold">Reason</span>
            <textarea rows={4} className="w-full rounded-md border border-border px-3 py-2 text-sm" id="reason" />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => {
                const el = document.getElementById("reason") as HTMLTextAreaElement | null;
                const reason = el?.value ?? "";
                suspendMutation.mutate({ userId: confirm.user.id, status: confirm.targetStatus, reason });
                setConfirm(null);
              }}
              className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-brand-foreground"
            >
              Confirm
            </button>
            <button onClick={() => setConfirm(null)} className="rounded-md border border-border px-3 py-2 text-sm">Cancel</button>
          </div>
        </Modal>
      )}

      {detail && <UserDrawer user={detail} onClose={() => setDetail(null)} onSuspend={(u) => setConfirm({ user: u, targetStatus: u.status === "active" ? "suspended" : "active" })} />}
    </AdminLayout>
  );
}

function UserDrawer({ user: summary, onClose, onSuspend }: { user: AdminUser; onClose: () => void; onSuspend: (user: AdminUser) => void }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ["admin", "user", summary.id], queryFn: () => fetchUserDetails(summary.id) });
  const user = data?.user ?? summary;
  const shipping = user.shippingAddresses?.length ? user.shippingAddresses : user.shippingProfile?.line1 ? [user.shippingProfile] : [];
  return (
    <Modal title={user.name} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/40 p-3">
          {user.avatarUrl ? <img src={user.avatarUrl} alt={`${user.name} profile`} className="h-16 w-16 rounded-full object-cover ring-2 ring-background" /> : <div className="grid h-16 w-16 place-items-center rounded-full bg-brand/10 text-lg font-black text-brand">{user.name.slice(0, 2).toUpperCase()}</div>}
          <div><p className="text-sm font-bold">Account details</p><p className="text-xs text-foreground/55">{isLoading ? "Loading full information…" : isError ? "Some details could not be loaded." : user.provider === "google" ? "Signed up with Google" : "Signed up with email and password"}</p></div>
        </div>
        <Field label="Name">
          <input className={inputClass} value={user.name} disabled />
        </Field>
        <Field label="Username">
          <input className={inputClass} value={user.username} disabled />
        </Field>
        <Field label="Email">
          <input className={inputClass} value={user.email} disabled />
        </Field>
        <Field label="Status">
          <input className={inputClass} value={user.status} disabled />
        </Field>
        <Field label="Member since">
          <input className={inputClass} value={new Date(user.createdAt).toLocaleDateString()} disabled />
        </Field>
        <Field label="Sign-up method"><input className={inputClass} value={user.provider === "google" ? "Google" : "Local form"} disabled /></Field>
        <Field label="Age"><input className={inputClass} value={user.age != null ? String(user.age) : "Not provided"} disabled /></Field>
        <Field label="Address"><textarea className={inputClass} value={user.address || "Not provided"} disabled rows={2} /></Field>
        {shipping.length > 0 && <Field label="Saved shipping address"><div className="space-y-2">{shipping.map((item, index) => <div key={index} className="rounded-lg border border-border bg-muted/40 p-2.5 text-sm">{[item.name, item.line1, item.line2, item.city, item.postal, item.country].filter(Boolean).join(", ")}</div>)}</div></Field>}
        <div className="flex flex-wrap gap-2 pt-1">
          <Btn variant="solid" onClick={onClose}>Close</Btn>
          <Btn onClick={() => onSuspend(user)}>
            {user.status === "active" ? "Suspend account" : "Restore account"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}