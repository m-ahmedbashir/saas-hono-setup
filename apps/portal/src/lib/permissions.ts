import { roles, type statement } from "@repo/core/auth/permissions";

type PermissionCheck = Partial<{ [K in keyof typeof statement]: (typeof statement)[K][number][] }>;

/**
 * Whether a member with this role holds these permissions — checked against the same
 * `roles` map the server enforces with (`Role.authorize()`, exactly what apps/api's
 * requirePermission runs), never by comparing role names. Callers pass the role from the
 * live member list rather than calling /organization/has-permission: that's no network
 * round trip (and no extra full-organization refetch, which every /organization/* call
 * triggers in Better Auth's client), and it can't go stale — the member list refreshes
 * itself after any role change. UX gating only; the server checks every action regardless.
 * A member can hold several comma-separated roles; any one that grants it is enough, same
 * as on the server.
 */
export function roleCan(role: string | undefined, permissions: PermissionCheck): boolean {
  if (!role) return false;
  return role
    .split(",")
    .some(
      (name) => roles[name.trim() as keyof typeof roles]?.authorize(permissions).success === true,
    );
}
