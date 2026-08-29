import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, Empty, Stat } from "@/components/admin/ui";
import { fetchOverview } from "@/lib/admin-api";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — Swapt control centre" },
      { name: "description", content: "Live overview of Swapt users, listings, swaps, reports and revenue with growth charts and activity graphs." },
      { property: "og:title", content: "Swapt admin dashboard" },
      { property: "og:description", content: "Users, listings, swaps, reports and growth analytics in one control centre." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminOverview,
});

const PIE = ["#f59e0b", "#10b981", "#6366f1", "#ef4444", "#94a3b8"];

function AdminOverview() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => fetchOverview(30) });
  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <AdminLayout
      title="Dashboard overview"
      subtitle="Everything happening across the marketplace right now"
      actions={
        <Link to="/admin/analytics" className="hidden rounded-md bg-foreground px-3 py-2.5 text-sm min-h-11 font-bold text-background sm:inline-block">
          Full analytics
        </Link>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="Total users" value={data?.totalUsers} hint="All registered accounts" />
        <Stat label="Active users" value={data?.activeUsers} tone="good" />
        <Stat label="New today" value={data?.newUsersToday} tone="good" />
        <Stat label="Online now" value={data?.onlineUsers} tone="info" />
        <Stat label="Total listings" value={data?.totalListings} />
        <Stat label="Active" value={data?.activeListings} tone="good" />
        <Stat label="Swapped" value={data?.swappedListings} tone="info" />
        <Stat label="Hidden" value={data?.hiddenListings} tone="warn" />
        <Stat label="Swaps completed" value={data?.swapsCompleted} tone="good" />
        <Stat label="Swaps pending" value={data?.swapsPending} tone="warn" />
        <Stat label="Orders" value={data?.orders} />
        <Stat label="Revenue (credits)" value={data?.revenue} />
        <Stat label="Open reports" value={data?.openReports} tone="bad" />
        <Stat label="Open disputes" value={data?.openDisputes} tone="warn" />
        <Stat label="Active chats" value={data?.activeChats} tone="info" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <Header title="Growth" subtitle="New users and listings per day (30d)" />
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={data?.series ?? []}>
              <defs>
                <linearGradient id="gUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gProd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
              <Tooltip labelFormatter={(v) => fmt(String(v))} />
              <Legend />
              <Area type="monotone" dataKey="users" name="Users" stroke="#6366f1" fill="url(#gUsers)" strokeWidth={2} isAnimationActive={false} />
              <Area type="monotone" dataKey="products" name="Listings" stroke="#ef4444" fill="url(#gProd)" strokeWidth={2} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <Header title="User activity" subtitle="Daily visitors and swap actions" />
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data?.series ?? []}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={34} />
              <Tooltip labelFormatter={(v) => fmt(String(v))} />
              <Legend />
              <Bar dataKey="visitors" name="Visitors" fill="#94a3b8" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="swaps" name="Swaps" fill="#10b981" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <Header title="Swap status mix" subtitle="Distribution across all swaps" />
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Tooltip />
              <Legend />
              <Pie data={data?.swapMix ?? []} dataKey="count" nameKey="status" innerRadius={50} outerRadius={90} paddingAngle={2} isAnimationActive={false}>
                {(data?.swapMix ?? []).map((_, i) => (
                  <Cell key={i} fill={PIE[i % PIE.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <Header title="Most swapped categories" subtitle="Listings by category" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.topCategories ?? []} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} fontSize={11} width={110} />
              <Tooltip />
              <Bar dataKey="count" name="Listings" fill="#6366f1" radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <Header title="Most viewed products" subtitle="Top 8 by lifetime views" />
          {isLoading || !data ? (
            <Empty label="Loading…" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.mostViewed.map((p) => (
                <li key={p.title} className="flex items-center justify-between gap-3 py-2">
                  <span className="truncate">{p.title}</span>
                  <span className="shrink-0 font-bold tabular-nums">{p.views.toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <Header title="Top cities" subtitle="Members by location" />
          {isLoading || !data ? (
            <Empty label="Loading…" />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {data.topCities.map((c) => (
                <li key={c.city} className="flex items-center justify-between gap-3 py-2">
                  <span>{c.city}</span>
                  <span className="font-bold tabular-nums">{c.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="mb-3">
      <h2 className="text-base font-black tracking-tight">{title}</h2>
      <p className="text-xs text-foreground/55">{subtitle}</p>
    </header>
  );
}
