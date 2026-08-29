/**
 * Role and permission model for Swapt.
 *
 * Four roles, ordered by authority. Every screen and action checks a named
 * permission rather than the raw role string, so permissions can be widened
 * later without touching component code.
 */

export const ROLES = ["guest", "user", "verified", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  guest: "Guest",
  user: "Registered",
  verified: "Verified",
  admin: "Admin",
};

export const ROLE_BLURBS: Record<Role, string> = {
  guest: "Browse and search the marketplace. Cannot list, swap or message.",
  user: "List items, propose swaps, chat and save items. Listings need approval.",
  verified: "Everything a registered user can do, plus instant publishing, higher limits and a verified badge.",
  admin: "Full control of users, listings, categories, swaps, reports, CMS, rewards and settings.",
};

export const PERMISSIONS = [
  "browse.view",
  "listing.create",
  "listing.publishInstantly",
  "swap.propose",
  "chat.send",
  "wishlist.save",
  "report.create",
  "admin.access",
  "admin.users",
  "admin.products",
  "admin.categories",
  "admin.swaps",
  "admin.reports",
  "admin.chats",
  "admin.notifications",
  "admin.coupons",
  "admin.cms",
  "admin.analytics",
  "admin.logs",
  "admin.permissions",
  "admin.settings",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const GUEST: Permission[] = ["browse.view"];

const USER: Permission[] = [
  ...GUEST,
  "listing.create",
  "swap.propose",
  "chat.send",
  "wishlist.save",
  "report.create",
];

const VERIFIED: Permission[] = [...USER, "listing.publishInstantly"];

const ADMIN: Permission[] = [...VERIFIED, ...PERMISSIONS.filter((p) => p.startsWith("admin."))];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  guest: GUEST,
  user: USER,
  verified: VERIFIED,
  admin: [...new Set(ADMIN)],
};

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role ?? "guest"]?.includes(permission) ?? false;
}

export function roleRank(role: Role | null | undefined): number {
  return Math.max(0, ROLES.indexOf((role ?? "guest") as Role));
}

export function atLeast(role: Role | null | undefined, minimum: Role): boolean {
  return roleRank(role) >= roleRank(minimum);
}

/** Normalises whatever the API/local account returns into a known role. */
export function toRole(value: unknown): Role {
  return (ROLES as readonly string[]).includes(String(value)) ? (value as Role) : "user";
}
