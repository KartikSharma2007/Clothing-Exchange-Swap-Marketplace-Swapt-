import { api, apiEnabled, setAccessToken, ApiError } from "@/lib/api";
import {
  changeLocalPassword,
  localLogin,
  localSignup,
  softDeleteLocalAccount,
  toAuthUser,
  updateLocalUser,
  type SignupInput,
} from "@/lib/local-account";

export type AuthUser = {
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string;
  location: string;
  avatarUrl: string | null;
  rating: number;
  ratingCount: number;
  swaps: number;
  credits: number;
  /** Credits currently locked in escrow on accepted swaps. */
  creditsHeld?: number;
  role?: "user" | "admin";
  status?: "active" | "suspended";
  name?: string;
  phone?: string;
  address?: string;
  /** Structured shipping profile used for shipping swaps. */
  shippingProfile?: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    postal?: string;
    country?: string;
    phone?: string;
  };
  preferredCarrier?: string;
  shipsWorldwide?: boolean;
  age?: number | null;
  provider?: string;
  /** Earned once the member verifies their phone — shown as a trust badge. */
  phoneVerified?: boolean;
  /** 0–100 swap-completion rate, null until enough terminal swaps exist. */
  reliability?: number | null;
  reliabilitySample?: number;
  /** Body measurements saved for "likely your fit" matching across the catalog. */
  measurements?: Measurements;
  heightCm?: number | null;
  usualSize?: string;
  /** Locale preferences (mirrored to localStorage via lib/preferences). */
  language?: string;
  currency?: string;
  accent?: "red" | "green" | "blue" | "black";
  /** Persisted notification & privacy prefs — enforced server-side. */
  swapAlerts?: boolean;
  emailUpdates?: boolean;
  marketing?: boolean;
  publicProfile?: boolean;
  showLocation?: boolean;
  createdAt?: string;
};

export type Measurements = {
  chest?: string;
  waist?: string;
  hips?: string;
  length?: string;
  inseam?: string;
  shoulder?: string;
  sleeve?: string;
};

type AuthResponse = { user: AuthUser; accessToken: string };

/**
 * True when the error means the submitted email belongs to a soft-deleted
 * (deactivated) account — the auth pages then show the recovery message with
 * a link to /contact instead of a generic error.
 */
export function isDeletedAccountError(err: unknown): boolean {
  if (err instanceof ApiError) return err.body?.deleted === true;
  return (err as { deleted?: boolean } | null)?.deleted === true;
}

/**
 * Exchanges a Google ID token for a Swapt session.
 *
 * The server verifies the token signature/audience against Google's certs
 * using the client secret, then issues our own JWT + refresh cookie.
 * `needsProfile` is true for first-time Google users who still owe us the
 * phone / address / age fields the marketplace requires.
 *
 * @param intent "signup" (from /signup) lets Google create a brand-new account;
 *               "signin" (from /login) refuses to create one — it only lets an
 *               existing user log in.
 */
export async function googleSignIn(idToken: string, intent: "signin" | "signup" = "signup") {
  const data = await api<
    AuthResponse & {
      needsProfile?: boolean;
      /** True when a local account with this email exists and must consent to linking. */
      needsConsent?: boolean;
      email?: string;
      displayName?: string;
    }
  >("/api/auth/google", {
    method: "POST",
    auth: false,
    body: { idToken, intent },
  });
  if (data.accessToken) setAccessToken(data.accessToken);
  return data;
}

/**
 * Explicitly link a Google identity to an existing local account, after the
 * user consents by entering the account's password (see /api/auth/google/link).
 */
export async function googleLink(idToken: string, email: string, password: string) {
  const data = await api<AuthResponse & { needsProfile?: boolean }>("/api/auth/google/link", {
    method: "POST",
    auth: false,
    body: { idToken, email, password },
  });
  setAccessToken(data.accessToken);
  return data;
}

/** Fills in the marketplace fields Google doesn't provide. */
export async function completeGoogleProfile(input: {
  name: string; phone: string; address: string; age: number; bio?: string;
}) {
  const { user } = await api<{ user: AuthUser }>("/api/auth/me", {
    method: "PATCH",
    body: {
      displayName: input.name,
      phone: input.phone,
      address: input.address,
      location: input.address,
      age: input.age,
      bio: input.bio ?? "",
    },
  });
  return user;
}

export async function login(email: string, password: string, rememberMe = true) {
  if (!apiEnabled) return toAuthUser(await localLogin(email, password)) as AuthUser;
  const data = await api<AuthResponse>("/api/auth/login", {
    method: "POST", auth: false, body: { email, password, rememberMe },
  });
  setAccessToken(data.accessToken);
  return data.user;
}

/** Result of a local sign-up: either a session, or "check your email to verify". */
export type SignupResult =
  | { needsVerification: true; email: string; devVerificationLink?: string; devToken?: string }
  | { user: AuthUser };

/** Full profile signup (local form or the Google profile-completion popup). */
export async function signUp(input: SignupInput): Promise<SignupResult> {
  if (!apiEnabled) return { user: toAuthUser(await localSignup(input)) as AuthUser };
  const data = await api<AuthResponse & { needsVerification?: true; email?: string; devVerificationLink?: string; devToken?: string }>("/api/auth/register", {
    method: "POST",
    auth: false,
    body: {
      username: input.email.split("@")[0].replace(/[^a-z0-9._]/gi, "").slice(0, 20),
      email: input.email,
      password: input.password,
      displayName: input.name,
      phone: input.phone,
      address: input.address,
      location: input.address,
      age: input.age,
      bio: input.bio ?? "",
      provider: input.provider ?? "local",
    },
  });
  // Email verification is required — the account isn't usable until confirmed.
  if (data.needsVerification) return { needsVerification: true, email: data.email ?? input.email, devVerificationLink: data.devVerificationLink, devToken: data.devToken };
  setAccessToken(data.accessToken);
  return { user: data.user };
}

export async function verifyEmail(token: string): Promise<{ ok: boolean }> {
  const data = await api<{ ok: boolean; accessToken?: string }>(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, { auth: false });
  // The server logs the user in on a successful verify — keep that session.
  if (data.accessToken) setAccessToken(data.accessToken);
  return { ok: data.ok === true };
}

export async function resendVerification(email: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/auth/resend-verification", { method: "POST", auth: false, body: { email } });
}

export async function devVerify(email: string): Promise<{ ok: boolean }> {
  const data = await api<{ ok: boolean; accessToken?: string }>("/api/auth/dev-verify", { method: "POST", auth: false, body: { email } });
  if (data.accessToken) setAccessToken(data.accessToken);
  return { ok: data.ok === true };
}

export async function register(input: {
  username: string; email: string; password: string; displayName?: string; location?: string;
}) {
  const data = await api<AuthResponse>("/api/auth/register", { method: "POST", auth: false, body: input });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function requestPasswordReset(email: string) {
  await api<{ ok: boolean }>("/api/auth/forgot", { method: "POST", auth: false, body: { email } });
}

export async function resetPassword(token: string, password: string) {
  await api<{ ok: boolean }>("/api/auth/reset", { method: "POST", auth: false, body: { token, password } });
}

export async function me() {
  if (!apiEnabled) return null;
  try {
    const { user } = await api<{ user: AuthUser }>("/api/auth/me");
    return user;
  } catch {
    return null;
  }
}

export async function saveProfile(input: {
  name?: string; bio?: string; phone?: string; address?: string; age?: number | null;
  measurements?: Measurements; heightCm?: number | null; usualSize?: string;
  shippingProfile?: AuthUser["shippingProfile"];
  preferredCarrier?: string;
  shipsWorldwide?: boolean;
  language?: string;
  currency?: string;
  accent?: "red" | "green" | "blue" | "black";
  swapAlerts?: boolean;
  emailUpdates?: boolean;
  marketing?: boolean;
  publicProfile?: boolean;
  showLocation?: boolean;
}) {
  if (!apiEnabled) {
    const updated = updateLocalUser({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.bio !== undefined ? { bio: input.bio } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.address !== undefined ? { address: input.address } : {}),
      ...(input.age !== undefined ? { age: input.age } : {}),
      ...(input.measurements !== undefined ? { measurements: input.measurements } : {}),
      ...(input.heightCm !== undefined ? { heightCm: input.heightCm } : {}),
      ...(input.usualSize !== undefined ? { usualSize: input.usualSize } : {}),
      ...(input.shippingProfile !== undefined ? { shippingProfile: input.shippingProfile } : {}),
      ...(input.preferredCarrier !== undefined ? { preferredCarrier: input.preferredCarrier } : {}),
      ...(input.shipsWorldwide !== undefined ? { shipsWorldwide: input.shipsWorldwide } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.swapAlerts !== undefined ? { swapAlerts: input.swapAlerts } : {}),
      ...(input.emailUpdates !== undefined ? { emailUpdates: input.emailUpdates } : {}),
      ...(input.marketing !== undefined ? { marketing: input.marketing } : {}),
      ...(input.publicProfile !== undefined ? { publicProfile: input.publicProfile } : {}),
      ...(input.showLocation !== undefined ? { showLocation: input.showLocation } : {}),
      ...(input.accent !== undefined ? { accent: input.accent } : {}),
    });
    return toAuthUser(updated) as AuthUser;
  }
  const { user } = await api<{ user: AuthUser }>("/api/auth/me", {
    method: "PATCH",
    body: {
      displayName: input.name,
      bio: input.bio,
      phone: input.phone,
      address: input.address,
      location: input.address,
      age: input.age,
      heightCm: input.heightCm,
      usualSize: input.usualSize,
      measurements: input.measurements,
      shippingProfile: input.shippingProfile,
      preferredCarrier: input.preferredCarrier,
      shipsWorldwide: input.shipsWorldwide,
      language: input.language,
      currency: input.currency,
      accent: input.accent,
      swapAlerts: input.swapAlerts,
      emailUpdates: input.emailUpdates,
      marketing: input.marketing,
      publicProfile: input.publicProfile,
      showLocation: input.showLocation,
    },
  });
  return user;
}

/** Upload (or replace) the signed-in user's profile picture. */
export async function uploadAvatar(file: File) {
  const form = new FormData();
  form.append("image", file);
  const { user } = await api<{ user: AuthUser }>("/api/auth/me/avatar", { method: "POST", body: form });
  return user;
}

/** Remove the signed-in user's profile picture. */
export async function removeAvatar() {
  const { user } = await api<{ user: AuthUser }>("/api/auth/me/avatar", { method: "DELETE" });
  return user;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  if (!apiEnabled) return changeLocalPassword(currentPassword, newPassword);
  await api<{ ok: boolean }>("/api/auth/password", { method: "POST", body: { currentPassword, newPassword } });
}

/** Soft delete — record is retained server-side, account disappears from the app. */
export async function deleteAccount(password: string) {
  if (!apiEnabled) return softDeleteLocalAccount(password);
  await api<{ ok: boolean }>("/api/auth/me", { method: "DELETE", body: { password } });
  setAccessToken(null);
}

export async function logout() {
  if (!apiEnabled) return;
  try {
    await api<{ ok: boolean }>("/api/auth/logout", { method: "POST", auth: false });
  } finally {
    setAccessToken(null);
  }
}
