/**
 * Local account store used when the exportable MERN API isn't configured
 * (no VITE_API_URL). It mirrors the server contract closely enough that the
 * UI flows — signup, login, profile edits, password change and *soft* delete
 * — behave exactly as they will against MongoDB.
 *
 * Soft delete: the record stays in storage with `deletedAt` set; it is hidden
 * from the app and sign-in with the same email/password is refused.
 */
import type { AuthUser } from "@/lib/auth-api";

export type LocalProfile = {
  id: string;
  username: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  age: number | null;
  bio: string;
  /** Salted SHA-256 hash (demo-mode equivalent of the server's bcrypt). */
  passwordHash?: string;
  /** Per-account random salt used with passwordHash. */
  passwordSalt?: string;
  /** Legacy plaintext password from before hashing — migrated away on login. */
  password?: string;
  provider: "local" | "google";
  avatarUrl: string | null;
  createdAt: string;
  deletedAt: string | null;
  measurements?: Record<string, string>;
  heightCm?: number | null;
  usualSize?: string;
  shippingProfile?: AuthUser["shippingProfile"];
  preferredCarrier?: string;
  shipsWorldwide?: boolean;
  accent?: "red" | "green" | "blue" | "black";
  language?: string;
  currency?: string;
  swapAlerts?: boolean;
  emailUpdates?: boolean;
  marketing?: boolean;
  publicProfile?: boolean;
  showLocation?: boolean;
  credits?: number;
  creditsHeld?: number;
};

const USERS_KEY = "swapt.local.users";
const SESSION_KEY = "swapt.local.session";

function readAll(): LocalProfile[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(USERS_KEY) ?? "[]") as LocalProfile[];
  } catch {
    return [];
  }
}

function writeAll(users: LocalProfile[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// ── Password hashing (demo-mode only) ──────────────────────────────────
// The real backend stores bcrypt hashes; here we approximate it with a salted
// SHA-256 digest so plaintext passwords never touch localStorage. Uses the
// async Web Crypto API, so the local-account functions that verify passwords
// are async too.

function randomSalt(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashPassword(password: string, salt: string): Promise<string> {
  return sha256(`${salt}::${password}`);
}

async function setPassword(profile: LocalProfile, password: string): Promise<void> {
  const passwordSalt = randomSalt();
  profile.passwordHash = await hashPassword(password, passwordSalt);
  profile.passwordSalt = passwordSalt;
  // Clear any legacy plaintext.
  delete profile.password;
}

/**
 * Verify a password against a stored profile. Supports the salted hash, and
 * migrates legacy plaintext records (from before hashing) to the hashed form
 * on a successful check.
 */
async function verifyPassword(profile: LocalProfile, password: string): Promise<boolean> {
  if (profile.passwordHash && profile.passwordSalt) {
    return (await hashPassword(password, profile.passwordSalt)) === profile.passwordHash;
  }
  // Legacy plaintext record — compare directly and upgrade to a hash.
  if (profile.password !== undefined) {
    const matches = profile.password === password;
    if (matches) await setPassword(profile, password);
    return matches;
  }
  return false;
}

export function toAuthUser(p: LocalProfile): AuthUser & { phone: string; address: string; age: number | null; name: string; provider: string } {
  return {
    id: p.id,
    username: p.username,
    email: p.email,
    displayName: p.name || p.username,
    bio: p.bio,
    location: p.address,
    avatarUrl: p.avatarUrl,
    rating: 4.9,
    ratingCount: 12,
    swaps: 6,
    credits: p.credits ?? 50,
    creditsHeld: p.creditsHeld ?? 0,
    role: "user",
    status: "active",
    name: p.name,
    phone: p.phone,
    address: p.address,
    age: p.age,
    provider: p.provider,
    measurements: p.measurements ?? {},
    heightCm: p.heightCm ?? null,
    usualSize: p.usualSize ?? "",
    shippingProfile: p.shippingProfile ?? {},
    preferredCarrier: p.preferredCarrier ?? "",
    shipsWorldwide: Boolean(p.shipsWorldwide),
    accent: (p as any).accent ?? "red",
    language: p.language ?? "",
    currency: p.currency ?? "",
    swapAlerts: p.swapAlerts ?? true,
    emailUpdates: p.emailUpdates ?? true,
    marketing: p.marketing ?? false,
    publicProfile: p.publicProfile ?? true,
    showLocation: p.showLocation ?? true,
  };
}

export class LocalAuthError extends Error {}

/** Error for a deactivated account — carries `deleted: true` so the auth pages
 *  can show the "contact support" recovery message (same shape as the API). */
function deletedAccountError(): LocalAuthError {
  const err = new LocalAuthError(
    "Your account has been deactivated. To recover your account, please contact support.",
  );
  (err as LocalAuthError & { deleted: boolean }).deleted = true;
  return err;
}

function usernameFrom(name: string, email: string) {
  const base = (name || email.split("@")[0] || "swapper")
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 20);
  return base || "swapper";
}

export type SignupInput = {
  name: string;
  email: string;
  phone: string;
  address: string;
  age: number;
  bio?: string;
  password: string;
  provider?: "local" | "google";
};

export async function localSignup(input: SignupInput): Promise<LocalProfile> {
  const users = readAll();
  const email = input.email.trim().toLowerCase();
  const existing = users.find((u) => u.email === email);
  if (existing && !existing.deletedAt) {
    throw new LocalAuthError("An account with that email already exists. Try logging in.");
  }
  if (existing?.deletedAt) {
    throw deletedAccountError();
  }

  let username = usernameFrom(input.name, email);
  while (users.some((u) => u.username === username)) username = `${username}${Math.floor(Math.random() * 90 + 10)}`;

  const profile: LocalProfile = {
    id: `u_${Date.now().toString(36)}`,
    username,
    name: input.name.trim(),
    email,
    phone: input.phone.trim(),
    address: input.address.trim(),
    age: input.age,
    bio: input.bio?.trim() ?? "",
    provider: input.provider ?? "local",
    avatarUrl: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    measurements: {},
    heightCm: null,
    usualSize: "",
  };
  await setPassword(profile, input.password);
  writeAll([...users, profile]);
  setSession(profile.id);
  return profile;
}

export async function localLogin(email: string, password: string): Promise<LocalProfile> {
  const users = readAll();
  const user = users.find((u) => u.email === email.trim().toLowerCase());
  if (!user || !(await verifyPassword(user, password))) {
    throw new LocalAuthError("We couldn't find an account with those details.");
  }
  if (user.deletedAt) {
    throw deletedAccountError();
  }
  // Persist any hash migration performed during verification.
  writeAll(users);
  setSession(user.id);
  return user;
}

export function findByEmail(email: string) {
  return readAll().find((u) => u.email === email.trim().toLowerCase() && !u.deletedAt) ?? null;
}

export function setSession(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(SESSION_KEY, id);
  else window.localStorage.removeItem(SESSION_KEY);
}

export function currentLocalUser(): LocalProfile | null {
  if (typeof window === "undefined") return null;
  const id = window.localStorage.getItem(SESSION_KEY);
  if (!id) return null;
  const user = readAll().find((u) => u.id === id);
  return user && !user.deletedAt ? user : null;
}

export function updateLocalUser(patch: Partial<Omit<LocalProfile, "id">>): LocalProfile {
  const current = currentLocalUser();
  if (!current) throw new LocalAuthError("You're not signed in.");
  const users = readAll().map((u) => (u.id === current.id ? { ...u, ...patch } : u));
  writeAll(users);
  return users.find((u) => u.id === current.id)!;
}

/**
 * Move credits on the signed-in local account. Returns the patch that was
 * applied (or null when not signed in) so callers can refresh the auth context.
 */
export function applyDemoCredits(patch: { credits?: number; creditsHeld?: number }): { credits: number; creditsHeld: number } | null {
  try {
    const updated = updateLocalUser(patch);
    return { credits: updated.credits ?? 0, creditsHeld: updated.creditsHeld ?? 0 };
  } catch {
    return null;
  }
}

export async function changeLocalPassword(currentPassword: string, nextPassword: string) {
  const current = currentLocalUser();
  if (!current) throw new LocalAuthError("You're not signed in.");
  if (!(await verifyPassword(current, currentPassword))) throw new LocalAuthError("Your current password isn't correct.");
  await setPassword(current, nextPassword);
  const users = readAll().map((u) => (u.id === current.id ? current : u));
  writeAll(users);
}

/** Soft delete — the row stays, but the account disappears from the app. */
export async function softDeleteLocalAccount(password: string) {
  const current = currentLocalUser();
  if (!current) throw new LocalAuthError("You're not signed in.");
  if (!(await verifyPassword(current, password))) throw new LocalAuthError("Password confirmation failed.");
  updateLocalUser({ deletedAt: new Date().toISOString() });
  setSession(null);
}
