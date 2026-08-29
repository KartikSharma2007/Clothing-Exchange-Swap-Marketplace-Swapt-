import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";

/**
 * Client-side route guard. Renders children only for a signed-in member
 * (optionally an admin); otherwise redirects to /login.
 */
export function Protected({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) {
  const { loading, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      void navigate({ to: "/login", replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-16 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (adminOnly && !isAdmin) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
        <h1 className="text-2xl font-black tracking-tight">Admins only</h1>
        <p className="mt-2 text-sm text-foreground/60">
          Your account doesn't have moderation access. Ask an existing admin to promote you.
        </p>
        <Link to="/dashboard" className="mt-6 rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
