import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiEnabled, setAccessToken } from "@/lib/api";
import { logout as apiLogout, me, type AuthUser } from "@/lib/auth-api";
import { currentLocalUser, setSession, toAuthUser } from "@/lib/local-account";

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Demo mode — no VITE_API_URL configured, accounts live in this browser. */
  demo: boolean;
  refresh: () => Promise<void>;
  setUser: (user: AuthUser | null) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!apiEnabled) {
      const local = currentLocalUser();
      setUser(local ? (toAuthUser(local) as AuthUser) : null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setUser(await me());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    if (apiEnabled) await apiLogout();
    setAccessToken(null);
    setSession(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      isAdmin: (user as (AuthUser & { role?: string }) | null)?.role === "admin",
      demo: !apiEnabled,
      refresh,
      setUser,
      signOut,
    }),
    [user, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
