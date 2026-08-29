import { Link, useRouterState } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Package, FolderTree, BarChart3, Menu, X, ArrowLeft, ShieldAlert, Scale,
} from "lucide-react";
import { Protected } from "@/components/site/Protected";
import { useAuth } from "@/lib/auth-context";
import { apiEnabled } from "@/lib/api";

type NavItem = { to: string; label: string; icon: typeof Users };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [
      { to: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { to: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    title: "Marketplace",
    items: [
      { to: "/admin/users", label: "Users", icon: Users },
      { to: "/admin/products", label: "Products", icon: Package },
      { to: "/admin/categories", label: "Categories", icon: FolderTree },
    ],
  },
  {
    title: "Safety",
    items: [
      { to: "/admin/moderation", label: "Moderation", icon: ShieldAlert },
      { to: "/admin/reports", label: "Reports", icon: ShieldAlert },
      { to: "/admin/disputes", label: "Disputes", icon: Scale },
    ],
  },
];

export function AdminLayout({ title, subtitle, actions, children }: {
  title: string; subtitle?: string; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <Protected adminOnly>
      <Shell title={title} subtitle={subtitle} actions={actions}>
        {children}
      </Shell>
    </Protected>
  );
}

function Shell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex">
        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 overflow-y-auto border-r border-border bg-background transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between px-5 py-5">
            <Link to="/" className="text-lg font-black tracking-tight">
              Swapt<span className="text-primary">.admin</span>
            </Link>
            <button onClick={() => setOpen(false)} className="lg:hidden" aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="px-3 pb-8">
            {SECTIONS.map((section) => (
              <div key={section.title} className="mb-5">
                <p className="px-2 pb-1 text-xs font-bold uppercase tracking-wider text-foreground/40">{section.title}</p>
                {section.items.map((item) => {
                  const active = item.to === "/admin" ? path === "/admin" : path.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setOpen(false)}
                      className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${
                        active ? "bg-foreground text-background" : "text-foreground/70 hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}

            <Link to="/dashboard" className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold text-foreground/60 hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Back to app
            </Link>
          </nav>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />}

        {/* Content */}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
            <div className="flex items-center gap-3 px-4 py-4 md:px-8">
              <button onClick={() => setOpen(true)} className="lg:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-xl font-black tracking-tight md:text-2xl">{title}</h1>
                {subtitle && <p className="truncate text-xs text-foreground/55 md:text-sm">{subtitle}</p>}
              </div>
              {actions}
              <span className="hidden rounded-full bg-foreground px-3 py-2 text-sm min-h-9 font-bold text-background sm:inline">
                {user?.displayName ?? "Admin"}
              </span>
            </div>
          </header>

          <main className="px-4 py-6 md:px-8">
            {!apiEnabled && (
              <p className="mb-5 rounded-lg border border-border bg-background px-4 py-3 text-sm text-foreground/70">
                Preview data — every action here is real and audit-logged locally. Set{" "}
                <code className="font-mono">VITE_API_URL</code> to drive your MongoDB backend instead.
              </p>
            )}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
