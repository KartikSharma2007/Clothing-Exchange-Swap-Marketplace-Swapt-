import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Btn, Empty, Pill, SearchInput, Table, Toolbar, Modal, Field, inputClass } from "@/components/admin/ui";
import { fetchAdminCategories, setCategoryEnabled, addAdminCategory } from "@/lib/admin-api";

export const Route = createFileRoute("/admin_/categories")({
  head: () => ({
    meta: [
      { title: "Category management — Swapt admin" },
      { name: "description", content: "Enable and disable marketplace categories." },
      { property: "og:title", content: "Swapt category management" },
      { property: "og:description", content: "Enable and disable marketplace categories." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "categories"],
    queryFn: fetchAdminCategories,
  });

  const toggle = useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) => setCategoryEnabled(slug, enabled),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin", "categories"] }),
  });

  // Add category modal state and mutation
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [slugPreview, setSlugPreview] = useState("");

  const addMut = useMutation({
    mutationFn: (name: string) => addAdminCategory(name),
    onSuccess: () => {
      setShowAdd(false);
      setNewName("");
      setSlugPreview("");
      void qc.invalidateQueries({ queryKey: ["admin", "categories"] });
    },
  });

  // update slug preview when name changes
  useEffect(() => {
    setSlugPreview(newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  }, [newName]);

  const rows = (data ?? [])
    .filter((c) => !q.trim() || c.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.order - b.order);

  return (
    <AdminLayout
      title="Categories"
      subtitle="Disabling a category hides its listings from browse, facets and related suggestions until re-enabled"
    >
      <Toolbar>
        <SearchInput value={q} onChange={setQ} placeholder="Search categories…" />
        <Btn onClick={() => setShowAdd(true)} className="ml-2">Add category</Btn>
        <span className="ml-auto text-xs text-foreground/50">{data?.length ?? 0} categories · {data?.filter((c) => c.enabled).length ?? 0} enabled</span>
      </Toolbar>

      {showAdd && (
        <Modal title="Add category" onClose={() => setShowAdd(false)}>
          <form onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            addMut.mutate(newName.trim());
          }}>
            <Field label="Name">
              <input className={inputClass} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Vintage Dresses" />
            </Field>
            <Field label="Slug preview">
              <div className="text-xs text-foreground/60">{slugPreview || "(will be generated from name)"}</div>
            </Field>
            <div className="mt-4 flex items-center gap-2 justify-end">
              <Btn variant="ghost" onClick={() => setShowAdd(false)} type="button">Cancel</Btn>
              <Btn type="submit" disabled={addMut.isPending || !newName.trim()}>{addMut.isPending ? "Saving…" : "Add category"}</Btn>
            </div>
          </form>
        </Modal>
      )}

      {isLoading ? (
        <div className="grid place-items-center py-16 text-sm text-foreground/50">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <Empty label="No categories match that search" />
      ) : (
        <Table
          head={["Category", "Slug", "Active listings", "Status", ""]}
          children={rows.map((c) => (
            <tr key={c.slug} className="border-b border-border last:border-0 hover:bg-muted/40">
              <td className="px-3 py-3 text-sm font-semibold">{c.name}</td>
              <td className="px-3 py-3 text-xs text-foreground/50">{c.slug}</td>
              <td className="px-3 py-3 text-sm font-bold tabular-nums">{c.listings.toLocaleString()}</td>
              <td className="px-3 py-3">
                <Pill tone={c.enabled ? "good" : "warn"}>{c.enabled ? "enabled" : "disabled"}</Pill>
              </td>
              <td className="px-3 py-3 text-right">
                <Btn
                  variant={c.enabled ? "ghost" : "solid"}
                  disabled={toggle.isPending}
                  onClick={() => toggle.mutate({ slug: c.slug, enabled: !c.enabled })}
                >
                  {toggle.isPending ? "Saving…" : c.enabled ? "Disable" : "Enable"}
                </Btn>
              </td>
            </tr>
          ))}
        />
      )}
    </AdminLayout>
  );
}