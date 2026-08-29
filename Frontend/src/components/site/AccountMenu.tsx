import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronDown,
  LayoutDashboard,
  LogOut,
  MessageCircle,
  Settings,
  ShieldCheck,
  ShoppingBag,
  User as UserIcon,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Signed-in navbar affordance. Sign out lives only inside this dropdown —
 * it is never rendered directly in the navbar.
 */
export function AccountMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;
  const name = user.displayName || user.username;

  const links = [
    { to: "/dashboard", label: "Account dashboard", icon: LayoutDashboard },
    { to: "/messages", label: "Messages", icon: MessageCircle },
    { to: "/bag", label: "My Bag", icon: ShoppingBag },
    { to: "/wallet", label: "Wallet & receipts", icon: Wallet },
    { to: "/settings", label: "Settings", icon: Settings },
  ] as const;

  return (
    <div ref={wrapRef} className="relative">
      {/* Mobile: clean circular avatar · Desktop (sm+): pill with name + chevron */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu — ${name}`}
        className="group relative grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-muted active:bg-muted sm:inline-flex sm:h-auto sm:w-auto sm:items-center sm:gap-1.5 sm:rounded-full sm:border sm:border-border sm:bg-transparent sm:py-1 sm:pl-1 sm:pr-2.5"
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="h-9 w-9 rounded-full object-cover ring-2 ring-border transition group-hover:ring-brand/40 sm:h-8 sm:w-8 sm:ring-0"
          />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand to-brand/80 text-xs font-black text-white ring-2 ring-ring/0 transition group-hover:ring-brand/30 sm:h-8 sm:w-8">
            {initials(name) || <UserIcon className="h-4 w-4" />}
          </span>
        )}
        <span className="hidden max-w-[9rem] truncate text-sm font-semibold sm:inline">{name}</span>
        <ChevronDown className={`hidden h-3.5 w-3.5 opacity-60 transition-transform sm:block ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          /* Mobile: fixed centred sheet (never clipped). Desktop: original dropdown. */
          className="fixed left-1/2 top-[4.75rem] z-[70] w-[calc(100vw-1rem)] max-w-[320px] -translate-x-1/2 animate-scale-in overflow-hidden rounded-3xl border border-border bg-card shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 sm:max-w-none sm:-translate-x-0 sm:rounded-2xl max-md:w-[calc(100vw-1rem)]"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-bold">{name}</p>
            <p className="truncate text-xs text-foreground/60">{user.email}</p>
          </div>

          <ul className="p-1.5">
            {links.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <Link
                  to={to}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted active:bg-muted"
                >
                  <Icon className="h-4 w-4 text-foreground/60" /> {label}
                </Link>
              </li>
            ))}
            {isAdmin && (
              <li>
                <Link
                  to="/admin"
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand transition-colors hover:bg-muted"
                >
                  <ShieldCheck className="h-4 w-4" /> Admin panel
                </Link>
              </li>
            )}
          </ul>

          <div className="border-t border-border p-1.5">
            <button
              onClick={async () => {
                setOpen(false);
                await signOut();
                void navigate({ to: "/" });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
