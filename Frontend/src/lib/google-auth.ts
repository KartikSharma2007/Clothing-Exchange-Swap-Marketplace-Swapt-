/**
 * Google Identity Services (GIS) integration.
 *
 * Production flow — no fake account chooser:
 *   1. Load https://accounts.google.com/gsi/client once.
 *   2. Initialise with VITE_GOOGLE_CLIENT_ID (never a secret; the client ID is
 *      public by design). The client *secret* stays on the Express server.
 *   3. Google returns a signed ID token (JWT) to the callback.
 *   4. The ID token is POSTed to `/api/auth/google`, where the server verifies
 *      it against Google's certs with the client secret, then issues our own
 *      access token + httpOnly refresh cookie.
 *
 * Nothing is hardcoded: if VITE_GOOGLE_CLIENT_ID is absent the button reports
 * that Google sign-in is not configured instead of faking a session.
 */

export const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() ?? "";

export const googleConfigured = Boolean(GOOGLE_CLIENT_ID);

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type CredentialResponse = { credential?: string; error?: string };

type GoogleIdApi = {
  initialize: (config: {
    client_id: string;
    callback: (response: CredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    ux_mode?: "popup" | "redirect";
    use_fedcm_for_prompt?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  prompt: (listener?: (notification: unknown) => void) => void;
  cancel: () => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

export class GoogleAuthError extends Error {}

let scriptPromise: Promise<GoogleIdApi> | null = null;

/** Loads the GIS script once and resolves with the `google.accounts.id` API. */
export function loadGoogleIdentity(): Promise<GoogleIdApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new GoogleAuthError("Google sign-in is only available in the browser."));
  }
  if (!googleConfigured) {
    return Promise.reject(
      new GoogleAuthError("Google sign-in isn't configured. Add VITE_GOOGLE_CLIENT_ID to your environment."),
    );
  }
  const existing = window.google?.accounts?.id;
  if (existing) return Promise.resolve(existing);

  if (!scriptPromise) {
    scriptPromise = new Promise<GoogleIdApi>((resolve, reject) => {
      const done = () => {
        const api = window.google?.accounts?.id;
        if (api) resolve(api);
        else reject(new GoogleAuthError("Google Identity Services failed to initialise."));
      };
      const prior = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
      if (prior) {
        prior.addEventListener("load", done, { once: true });
        prior.addEventListener("error", () => reject(new GoogleAuthError("Couldn't reach Google.")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = done;
      script.onerror = () => {
        scriptPromise = null;
        reject(new GoogleAuthError("Couldn't reach Google. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/**
 * Renders Google's own branded button into `container` (GIS requires a real
 * rendered button; `prompt()` alone is blocked in many browsers). Resolves with
 * the signed ID token when the user completes the flow.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (idToken: string) => void,
  onError: (error: Error) => void,
  options: { theme?: "outline" | "filled_black"; width?: number; text?: "signin_with" | "signup_with" } = {},
): Promise<void> {
  const api = await loadGoogleIdentity();
  api.initialize({
    client_id: GOOGLE_CLIENT_ID,
    ux_mode: "popup",
    cancel_on_tap_outside: true,
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
      else onError(new GoogleAuthError(response.error || "Google sign-in was cancelled."));
    },
  });
  container.replaceChildren();
  api.renderButton(container, {
    type: "standard",
    theme: options.theme ?? "outline",
    size: "large",
    shape: "pill",
    text: options.text ?? "continue_with",
    logo_alignment: "center",
    width: options.width ?? 320,
  });
}

/** Clears GIS auto-select so the next sign-in always asks. Call on sign out. */
export function resetGoogleAutoSelect() {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* GIS not loaded — nothing to reset */
  }
}
