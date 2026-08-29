import { api, apiEnabled } from "@/lib/api";

export type AnalyticsPoint = {
  date: string;
  listings: number;
  swaps: number;
  completed: number;
  moderation: number;
  signups: number;
};

export type Analytics = {
  days: number;
  totals: {
    activeListings: number;
    totalSwaps: number;
    completedSwaps: number;
    users: number;
    conversionRate: number;
  };
  timeline: AnalyticsPoint[];
  swapStatus: { status: string; count: number }[];
  categories: { category: string; count: number }[];
  signups: { date: string; count: number }[];
  retention: {
    byDay: { date: string; active: number; returning: number }[];
    currentActive: number;
    currentReturning: number;
    retentionRate: number;
  };
  funnel: {
    views: number;
    saves: number;
    proposals: number;
    accepted: number;
    completed: number;
    proposalRate: number;
    completionRate: number;
  };
  moderation: {
    openReports: number;
    openDisputes: number;
    resolvedReports: number;
    resolvedDisputes: number;
    reportResolutionHours: number;
    disputeResolutionHours: number;
    actions24h: number;
    byAction: { action: string; count: number }[];
  };
  listingStats: {
    byStatus: { status: string; count: number }[];
    totalViews: number;
    totalSaves: number;
  };
};

function demoAnalytics(days: number): Analytics {
  const timeline: AnalyticsPoint[] = Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10);
    const wave = Math.sin(i / 3) * 4;
    const listings = Math.max(2, Math.round(14 + wave + (i % 5)));
    const swaps = Math.max(1, Math.round(9 + wave / 2 + (i % 4)));
    return {
      date,
      listings,
      swaps,
      completed: Math.max(0, Math.round(swaps * 0.45)),
      moderation: Math.max(0, Math.round(3 + Math.cos(i / 2) * 2)),
      signups: Math.max(1, Math.round(6 + Math.sin(i / 4) * 3)),
    };
  });

  const totalSwaps = timeline.reduce((a, p) => a + p.swaps, 0);
  const completedSwaps = timeline.reduce((a, p) => a + p.completed, 0);

  return {
    days,
    totals: {
      activeListings: 1284,
      totalSwaps,
      completedSwaps,
      users: 3120,
      conversionRate: Math.round((completedSwaps / totalSwaps) * 1000) / 10,
    },
    timeline,
    swapStatus: [
      { status: "pending", count: 86 },
      { status: "accepted", count: 54 },
      { status: "completed", count: completedSwaps },
      { status: "declined", count: 21 },
      { status: "cancelled", count: 12 },
    ],
    categories: [
      { category: "Tops", count: 412 },
      { category: "Outerwear", count: 288 },
      { category: "Bottoms", count: 231 },
      { category: "Dresses", count: 176 },
      { category: "Shoes", count: 142 },
      { category: "Accessories", count: 98 },
    ],
    signups: timeline.map((p) => ({ date: p.date, count: p.signups })),
    retention: {
      byDay: timeline.map((p, i) => {
        const active = Math.round(p.swaps * 2 + p.signups * 0.8);
        return {
          date: p.date,
          active,
          returning: Math.round(active * (0.35 + 0.12 * Math.sin(i / 2))),
        };
      }),
      currentActive: 384,
      currentReturning: 137,
      retentionRate: 35.7,
    },
    funnel: {
      views: 84620,
      saves: 12340,
      proposals: totalSwaps,
      accepted: Math.round(totalSwaps * 0.62),
      completed: completedSwaps,
      proposalRate: 11.4,
      completionRate: Math.round((completedSwaps / totalSwaps) * 1000) / 10,
    },
    moderation: {
      openReports: 4,
      openDisputes: 2,
      resolvedReports: 87,
      resolvedDisputes: 23,
      reportResolutionHours: 18.5,
      disputeResolutionHours: 26.2,
      actions24h: 64,
      byAction: [
        { action: "user.report", count: 41 },
        { action: "listing.hide", count: 22 },
        { action: "swap.dispute_resolved", count: 9 },
        { action: "user.suspend", count: 6 },
        { action: "listing.feature", count: 4 },
      ],
    },
    listingStats: {
      byStatus: [
        { status: "active", count: 1284 },
        { status: "swapped", count: 412 },
        { status: "hidden", count: 87 },
      ],
      totalViews: 84620,
      totalSaves: 12340,
    },
  };
}

export async function fetchAnalytics(days = 30): Promise<Analytics> {
  if (!apiEnabled) return demoAnalytics(days);
  return api<Analytics>(`/api/admin/analytics?days=${days}`);
}