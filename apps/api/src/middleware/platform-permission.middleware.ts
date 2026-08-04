import { createMiddleware } from "hono/factory";
import { platformRoles, type platformStatement } from "@repo/core/auth/platform-permissions";
import { AppError } from "@repo/core";

type PlatformPermissionCheck = Partial<{
  [K in keyof typeof platformStatement]: (typeof platformStatement)[K][number][];
}>;

/**
 * Mirrors `requirePermission` (permission.middleware.ts) exactly in shape, but checks a
 * completely different column: `userContext.user.role` (the platform-operator tier,
 * `packages/core/src/auth/platform-permissions.ts`), not `userContext.roles` (org-member
 * roles). These are deliberately two separate gates, not variants of one — see
 * AGENTS.md's Platform admin section on why `user.role` and `member.role` never collide.
 * Every existing platform-admin action (list/ban/etc. users) is Better Auth's own admin
 * plugin route, which enforces this internally; this is the first custom apps/api route
 * that needs the same check written out here.
 */
export const requirePlatformPermission = (permissions: PlatformPermissionCheck) =>
  createMiddleware(async (c, next) => {
    const userContext = c.get("userContext");

    if (!userContext) {
      throw new AppError(
        "INTERNAL_ERROR",
        "requirePlatformPermission used without injectUserContext running first",
      );
    }

    const role = userContext.user.role;
    const allowed =
      !!role &&
      role in platformRoles &&
      platformRoles[role as keyof typeof platformRoles].authorize(permissions).success;

    if (!allowed) {
      throw new AppError("FORBIDDEN", "Platform access required");
    }

    await next();
  });
