import { createAccessControl } from "better-auth/plugins/access";

/**
 * Platform-wide operator roles — a completely separate concept from the organization
 * plugin's roles (`./permissions.ts`). This governs `user.role` (one flag on the account
 * itself, checked by Better Auth's own `admin` plugin), not `member.role` (per-org-
 * membership, checked by `requirePermission`). See AGENTS.md's Platform admin section.
 */
export const platformStatement = {
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
  // Not one of the admin plugin's own resources (that plugin only knows about
  // `user`/`session`) — added so `requirePlatformPermission`
  // (apps/api/src/middleware/platform-permission.middleware.ts) can reuse this same
  // statement/roles/authorize() machinery for platform-wide, non-admin-plugin routes
  // (GET/POST /platform-organizations) instead of inventing a second, parallel
  // permission system. `create` is provisioning a new tenant on someone else's behalf —
  // admin-only, not granted to `support` (read-only tier, same reasoning as `user`'s
  // create/set-role/ban being withheld from it above). `ban` is a flag-only oversight
  // action for now (organization_profile.suspended) — no route enforces it yet, see
  // platform-organizations.service.ts.
  organization: ["list", "create", "ban"],
} as const;

export const platformAccessControl = createAccessControl(platformStatement);

/**
 * Matches Better Auth's own built-in default admin role exactly — verified against the
 * installed plugin's `access/statement.mjs` (`defaultAc.newRole(...)`'s `adminAc`), not
 * guessed. Passing a custom `roles` map to the `admin` plugin REPLACES its defaults
 * rather than merging — the same "replaces, doesn't merge" behavior already documented
 * for the organization plugin (permissions.ts) — so the existing platform admin account
 * would silently lose "impersonate"/"delete"/etc. the moment this role granted anything
 * less than Better Auth's own default. Deliberately does NOT include
 * "impersonate-admins" — the installed default `adminAc` doesn't grant it either; that
 * action exists in `platformStatement` only so it CAN be granted to a role later, same
 * reasoning Better Auth's own defaults use.
 */
export const platformAdminRole = platformAccessControl.newRole({
  user: [
    "create",
    "list",
    "set-role",
    "ban",
    "impersonate",
    "delete",
    "set-password",
    "set-email",
    "get",
    "update",
  ],
  session: ["list", "revoke", "delete"],
  organization: ["list", "create", "ban"],
});

/**
 * Read-only operator tier — can look up/list users (e.g. to verify an account exists,
 * help a customer) but can't ban, delete, change roles, reset passwords, or impersonate.
 * A genuine, deliberately bounded second tier, not "everything admin has minus one
 * thing." Also granted `organization: ["list"]` — same "read-only visibility" tier as
 * users, for the platform organizations oversight view.
 */
export const platformSupportRole = platformAccessControl.newRole({
  user: ["list", "get"],
  session: [],
  organization: ["list"],
});

/**
 * Role name → Role object, the single map passed to the `admin` plugin's `roles`
 * config (`auth/index.ts`). Add a new tier here (and to `platformStatement` first, if it
 * needs a permission not already listed) rather than inventing a second roles map.
 */
export const platformRoles = {
  admin: platformAdminRole,
  support: platformSupportRole,
};
