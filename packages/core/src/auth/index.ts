import { betterAuth } from "better-auth";
import { organization, admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db, withOrgScope, ensureOrganizationProfileRow } from "@repo/db";
import * as schema from "@repo/db/schema";
import { accessControl, roles } from "./permissions";
import { platformAccessControl, platformRoles } from "./platform-permissions";

export { statement, roles } from "./permissions";
export { platformStatement, platformRoles, platformAccessControl } from "./platform-permissions";
// Re-exported for the same reason @repo/db re-exports drizzle-orm operators (see
// AGENTS.md) — `better-auth` isn't a direct dependency of apps/api, only of this
// package, so a consumer there importing `better-auth/api` directly could resolve a
// different pnpm-isolated instance with incompatible types. Go through here instead.
export { isAPIError } from "better-auth/api";

/**
 * Comma-separated platform-operator user ids (`ADMIN_USER_IDS`), e.g. "usr_123,usr_456".
 * Verified against the installed admin plugin's source (`has-permission.mjs`): a listed
 * id gets a blanket allow on every `/api/auth/admin/*` endpoint, independent of `user.role`
 * — the intended bootstrap path for the very first platform admin, since there's otherwise
 * no way to set `user.role: "admin"` without already having admin access. Once set,
 * `POST /api/auth/admin/set-role` can promote further accounts by role instead. Empty/unset
 * is a no-op (no platform admins), not "everyone is one."
 */
const adminUserIds = (process.env.ADMIN_USER_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(","),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    organization({
      ac: accessControl,
      roles,
      // A second instance of this file's one documented DIP exception (importing `db`
      // for the adapter above) — Better Auth's hook API can only be wired here, inside
      // the same betterAuth() config, so the organization_profile row (specifically its
      // orgNumber) can be created immediately rather than lazily. See AGENTS.md's
      // Organization Profile section. Failure here would otherwise silently swallow the
      // org creation response's success — let it propagate; it's a real bug to see.
      organizationHooks: {
        afterCreateOrganization: async ({ organization: createdOrganization }) => {
          await withOrgScope(createdOrganization.id, (tx) =>
            ensureOrganizationProfileRow(tx, createdOrganization.id),
          );
        },
      },
    }),
    // Platform-wide operator access (list/ban/impersonate/etc. any user, any org) — a
    // separate concept from the organization plugin's roles above, not a conflicting one:
    // this reads/writes `user.role` (one flag on the account itself), the organization
    // plugin reads/writes `member.role` (per-org-membership). Same role *name* ("admin")
    // can exist in both without collision since they're different columns entirely.
    // `roles`/`ac` are custom (platform-permissions.ts) — two tiers, `admin` (full access,
    // matches Better Auth's own built-in default admin role exactly, verified against its
    // source, so no existing admin silently loses capabilities) and `support`
    // (list/get only). See AGENTS.md's Platform admin section.
    admin({ adminUserIds, roles: platformRoles, ac: platformAccessControl }),
  ],
});
