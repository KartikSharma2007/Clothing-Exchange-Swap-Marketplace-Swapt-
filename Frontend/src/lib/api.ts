/**
 * Client for the exportable MERN backend in `/server`.
 *
 * Set VITE_API_URL (e.g. http://localhost:4000) to point the app at the
 * Express API. When it is unset, the app falls back to the bundled mock
 * listings so the design shell still renders.
 */
export const API_URL = (() => {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  if (!raw) return "";
  // Auto-rewrite localhost → LAN IP when frontend is loaded via LAN IP (mobile)
  // Keeps `localhost` working on PC while making mobile work even if env still says localhost
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host && host !== "localhost" && host !== "127.0.0.1" && /localhost|127\.0\.0\.1/.test(raw)) {
      try {
        const u = new URL(raw);
        u.hostname = host;
        return u.toString().replace(/\/$/, "");
      } catch {}
    }
  }
  return raw;
})();
export const apiEnabled = Boolean(API_URL);

// Helper for image/asset URLs that may still be localhost from the API (e.g. Cloudinary proxy via API_ORIGIN)
// Rewrites localhost → current LAN hostname so images load on mobile even if API_ORIGIN is still localhost
export function assetUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (typeof window === "undefined") return url as string;
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1" && /localhost|127\.0\.0\.1/.test(url)) {
    try {
      const u = new URL(url as string);
      u.hostname = host;
      return u.toString();
    } catch {}
  }
  return url as string;
}

const ACCESS_TOKEN_KEY = "swapt.accessToken";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  else window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];
  body?: Record<string, unknown>;
  constructor(status: number, message: string, issues?: { path: string; message: string }[], body?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.issues = issues;
    this.body = body;
  }
}

let refreshing: Promise<boolean> | null = null;

const DEFAULT_TIMEOUT_MS = 15_000;

/** fetch() with a hard deadline, and network failures normalized into ApiError. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      throw new ApiError(0, "The request timed out. Check your connection and try again.");
    }
    // Offline / DNS failure / connection refused — surface a friendly error
    // instead of an untyped TypeError that callers can't handle.
    throw new ApiError(0, "Couldn't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

async function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetchWithTimeout(`${API_URL}/api/auth/refresh`, { method: "POST", credentials: "include" }, DEFAULT_TIMEOUT_MS)
      .then(async (res) => {
        if (!res.ok) {
          setAccessToken(null);
          return false;
        }
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean; retry?: boolean; timeout?: number };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  if (!apiEnabled) throw new ApiError(0, "VITE_API_URL is not configured");

  const { body, auth = true, retry = true, timeout = DEFAULT_TIMEOUT_MS, headers, ...rest } = options;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const finalHeaders = new Headers(headers);
  if (!isFormData && body !== undefined) finalHeaders.set("Content-Type", "application/json");
  const token = auth ? getAccessToken() : null;
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);

  const res = await fetchWithTimeout(
    `${API_URL}${path}`,
    {
      ...rest,
      headers: finalHeaders,
      credentials: "include",
      body: isFormData ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
    },
    timeout,
  );

  // Access token expired → rotate the refresh token once and replay.
  if (res.status === 401 && retry && auth && !path.startsWith("/api/auth/refresh")) {
    if (await refreshSession()) return api<T>(path, { ...options, retry: false });
  }

  const payload = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (payload as { error?: string }).error || "Request failed",
      (payload as { issues?: { path: string; message: string }[] }).issues,
      payload,
    );
  }
  return payload as T;
}

export { refreshSession };
