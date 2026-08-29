import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Protected } from "@/components/site/Protected";
import { apiEnabled } from "@/lib/api";
import { fetchAnalytics } from "@/lib/analytics-api";

export const Route = createFileRoute("/admin_/analytics")({
  head: () => ({
    meta: [
      { title: "Marketplace analytics â€” Swapt admin" },
      { name: "description", content: "Track active listings, swap volume, completion conversion and moderation activity across the Swapt marketplace." },
      { property: "og:title", content: "Swapt marketplace analytics" },
      { property: "og:description", content: "Listings, swaps, conversion and moderation charts for admins." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <Protected adminOnly>
      <AnalyticsPage />
    </Protected>
  ),
});

const PIE_COLORS = ["#f59e0b", "#10b981", "#6366f1", "#ef4444", "#94a3b8"];

function AnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "analytics", days], queryFn: () => fetchAnalytics(days) });

  const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const t = data?.timeline ?? [];
  const funnel = data?.funnel;
  const mod = data?.moderation;
  const ls = data?.listingStats;

  return (
    <AdminLayout title="Marketplace analytics" subtitle="Growth, conversion, retention, listings and moderation KPIs.">
      <div>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-black leading-none tracking-tight sm:text-3xl">Marketplace analytics</h1>
            <p className="mt-1 text-sm text-foreground/60">Growth, conversion, retention, listings and moderation KPIs.</p>
          </div>
          <div className="flex gap-1 rounded-full border border-border bg-card p-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded px-3 py-1.5 text-sm font-semibold ${
                  days === d ? "bg-foreground text-background" : "text-foreground/60 hover:text-foreground"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </header>

        {!apiEnabled && (
          <p className="mt-4 rounded-lg border border-border bg-surface-cream px-4 py-3 text-sm text-foreground/70">
            Preview metrics. Set <code className="font-mono">VITE_API_URL</code> to chart live marketplace data.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-5">
          <Kpi label="Active listings" value={data?.totals.activeListings} loading={isLoading} />
          <Kpi label="Swaps proposed" value={data?.totals.totalSwaps} loading={isLoading} />
          <Kpi label="Swaps completed" value={data?.totals.completedSwaps} loading={isLoading} />
          <Kpi label="Conversion" value={data?.totals.conversionRate} suffix="%" loading={isLoading} />
          <Kpi label="Members" value={data?.totals.users} loading={isLoading} />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Listings created" subtitle={`New listings per day, last ${days} days`}>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={t}>
                <defs>
                  <linearGradient id="listingsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                <Tooltip labelFormatter={(v) => fmt(String(v))} />
                <Area type="monotone" dataKey="listings" stroke="#ef4444" fill="url(#listingsFill)" strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="Swaps vs. completions" subtitle="Proposal volume and finished exchanges">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={t}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                <Tooltip labelFormatter={(v) => fmt(String(v))} />
                <Legend />
                <Line type="monotone" dataKey="swaps" stroke="#6366f1" strokeWidth={2} dot={false} name="Proposed" isAnimationActive={false} />
                <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} dot={false} name="Completed" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>
        </div>

        {/* Retention */}
        <section className="mt-10">
          <header className="mb-3">
            <h2 className="text-xl font-black tracking-tight">Member retention</h2>
            <p className="text-sm text-foreground/60">Distinct members active per day, and returning members who were active in an earlier period.</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="Active today" value={data?.retention.currentActive} loading={isLoading} />
            <Kpi label="Returning today" value={data?.retention.currentReturning} loading={isLoading} />
            <Kpi label="Retention rate" value={data?.retention.retentionRate} suffix="%" loading={isLoading} />
          </div>
          <div className="mt-4">
            <Panel title="Active vs. returning members" subtitle={`Per day, last ${days} days`}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data?.retention.byDay ?? []}>
                  <defs>
                    <linearGradient id="activeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="returnFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <Tooltip labelFormatter={(v) => fmt(String(v))} />
                  <Legend />
                  <Area type="monotone" dataKey="active" stroke="#6366f1" fill="url(#activeFill)" strokeWidth={2} name="Active" isAnimationActive={false} />
                  <Area type="monotone" dataKey="returning" stroke="#10b981" fill="url(#returnFill)" strokeWidth={2} name="Returning" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </section>

        {/* Conversion funnel */}
        <section className="mt-10">
          <header className="mb-3">
            <h2 className="text-xl font-black tracking-tight">Conversion funnel</h2>
            <p className="text-sm text-foreground/60">Views â†’ proposals â†’ accepted â†’ completed. Rates are over the visible window.</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Views" value={funnel?.views} loading={isLoading} />
            <Kpi label="Saves" value={funnel?.saves} loading={isLoading} />
            <Kpi label="Proposals" value={funnel?.proposals} loading={isLoading} />
            <Kpi label="Accepted" value={funnel?.accepted} loading={isLoading} />
            <Kpi label="Completed" value={funnel?.completed} loading={isLoading} />
            <Kpi label="Viewâ†’proposal" value={funnel?.proposalRate} suffix="%" loading={isLoading} />
          </div>
          <div className="mt-4">
            <Panel title="Funnel steps" subtitle="Total members per stage, all-time">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={[
                  { stage: "Views", count: funnel?.views ?? 0 },
                  { stage: "Saves", count: funnel?.saves ?? 0 },
                  { stage: "Proposals", count: funnel?.proposals ?? 0 },
                  { stage: "Accepted", count: funnel?.accepted ?? 0 },
                  { stage: "Completed", count: funnel?.completed ?? 0 },
                ]} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis type="category" dataKey="stage" tickLine={false} axisLine={false} fontSize={12} width={90} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Members" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </section>

        {/* Listings growth */}
        <section className="mt-10">
          <header className="mb-3">
            <h2 className="text-xl font-black tracking-tight">Listings growth</h2>
            <p className="text-sm text-foreground/60">Status mix and engagement across the catalogue.</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-3">
            <Kpi label="Total views" value={ls?.totalViews} loading={isLoading} />
            <Kpi label="Total saves" value={ls?.totalSaves} loading={isLoading} />
            <Kpi label="Active listings" value={data?.totals.activeListings} loading={isLoading} />
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <Panel title="Listings by status" subtitle="Active, swapped and hidden">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={ls?.byStatus ?? []}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="status" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} name="Listings" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Swap status mix" subtitle="All-time distribution">
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Tooltip />
                  <Legend />
                  <Pie
                    data={data?.swapStatus ?? []}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={2}
                    isAnimationActive={false}
                  >
                    {(data?.swapStatus ?? []).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </section>

        {/* Moderation KPIs */}
        <section className="mt-10">
          <header className="mb-3">
            <h2 className="text-xl font-black tracking-tight">Moderation KPIs</h2>
            <p className="text-sm text-foreground/60">Reports, disputes, resolution latency and audit activity.</p>
          </header>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Open reports" value={mod?.openReports} loading={isLoading} />
            <Kpi label="Open disputes" value={mod?.openDisputes} loading={isLoading} />
            <Kpi label="Resolved reports" value={mod?.resolvedReports} loading={isLoading} />
            <Kpi label="Resolved disputes" value={mod?.resolvedDisputes} loading={isLoading} />
            <Kpi label="Report resolution" value={mod?.reportResolutionHours} suffix="h" loading={isLoading} />
            <Kpi label="Dispute resolution" value={mod?.disputeResolutionHours} suffix="h" loading={isLoading} />
            <Kpi label="Mod actions (24h)" value={mod?.actions24h} loading={isLoading} />
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <Panel title="Moderation activity" subtitle="Audit-logged actions per day">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={t}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmt} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <Tooltip labelFormatter={(v) => fmt(String(v))} />
                  <Bar dataKey="moderation" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Actions" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>

            <Panel title="Actions by type" subtitle="Top audit actions in the window">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={mod?.byAction ?? []} layout="vertical" margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis type="category" dataKey="action" tickLine={false} axisLine={false} fontSize={12} width={96} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#ef4444" radius={[0, 4, 4, 0]} name="Actions" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>
        </section>

        {/* Top categories */}
        <div className="mt-10">
          <Panel title="Top categories" subtitle="Listings by category">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data?.categories ?? []} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} fontSize={12} width={90} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} name="Listings" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </AdminLayout>
  );
}

function Kpi({ label, value, suffix = "", loading }: { label: string; value?: number; suffix?: string; loading: boolean }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-sm text-foreground/60">{label}</p>
      {loading ? (
        <div className="mt-2 h-8 w-20 animate-pulse rounded bg-muted" />
      ) : (
        <p className="mt-1 text-3xl font-black tracking-tight">
          {(value ?? 0).toLocaleString()}
          {suffix}
        </p>
      )}
    </div>
  );
}

function Panel({
  title, subtitle, children, className = "",
}: { title: string; subtitle: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border p-4 md:p-5 ${className}`}>
      <header className="mb-3">
        <h2 className="text-base font-black tracking-tight">{title}</h2>
        <p className="text-xs text-foreground/55">{subtitle}</p>
      </header>
      {children}
    </section>
  );
}

