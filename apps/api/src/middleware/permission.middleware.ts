import { createMiddleware } from "hono/factory";
import { auth, type statement } from "@repo/core/auth";
import { AppError } from "@repo/core";

type PermissionCheck = Partial<{ [K in keyof typeof statement]: (typeof statement)[K][number][] }>;

/**
 * B2B2C members are checked against their org role via Better Auth's own
 * access-control (the only source of truth for what a role can do).
 * B2C has no org/role to check against, so it intentionally passes through —
 * an individual's access to their own data must be enforced by scoping the
 * query to their userId in the route's .db.ts, not by a permission lookup here.
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
      const result = await auth.api.hasPermission({
        headers: c.req.raw.headers,
        body: {
          organizationId: userContext.organizationId,
          permissions,
        },
      });

      if (!result.success) {
        throw new AppError("FORBIDDEN", "Insufficient permissions");
      }
    }

    await next();
  });
