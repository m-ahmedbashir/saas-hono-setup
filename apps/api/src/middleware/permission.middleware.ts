import { createMiddleware } from "hono/factory";
import { roles, type statement } from "@repo/core/auth";
import { AppError } from "@repo/core";

type PermissionCheck = Partial<{ [K in keyof typeof statement]: (typeof statement)[K][number][] }>;

/**
 * B2B2C members are checked against their org role via `roles` (`packages/core/src/
 * auth/permissions.ts`) — the exact same `Role` objects Better Auth's own
 * `organization` plugin uses internally. `Role.authorize()` is a pure, synchronous,
 * in-memory check (confirmed against the installed better-auth source, `access.d.mts`'s
 * `Role` type — no DB/network call in it at all). Calling `auth.api.hasPermission(...)`
 * here instead would re-derive the session and re-fetch the member's role from the DB —
 * both already resolved moments earlier, same request, by `injectUserContext`
 * (`userContext.roles`). Reusing that removes a fully redundant DB round-trip with zero
 * staleness risk: this is the same request reusing its own already-fresh data, not a
 * cache held across requests — nothing about session/role freshness elsewhere changes.
 * B2C has no org/role to check against, so it intentionally passes through — an
 * individual's access to their own data must be enforced by scoping the query to their
 * userId in the route's .db.ts, not by a permission lookup here.
 */
export const requirePermission = (permissions: PermissionCheck) =>
  createMiddleware(async (c, next) => {
    const userContext = c.get("userContext");

    if (!userContext) {
      throw new AppError(
        "INTERNAL_ERROR",
        "requirePermission used without injectUserContext running first",
      );
    }

    if (userContext.mode === "B2B2C") {
      const allowed = userContext.roles.some(
        (roleName) => roles[roleName as keyof typeof roles]?.authorize(permissions).success,
      );

      if (!allowed) {
        throw new AppError("FORBIDDEN", "Insufficient permissions");
      }
    }

    await next();
  });
