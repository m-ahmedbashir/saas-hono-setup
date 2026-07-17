import { createMiddleware } from "hono/factory";
import { auth } from "@repo/core/auth";
import { AppError } from "@repo/core";

export type UserContext =
  | {
      mode: "B2B2C";
      user: typeof auth.$Infer.Session.user;
      organizationId: string;
      roles: string[];
    }
  | { mode: "B2C"; user: typeof auth.$Infer.Session.user; organizationId: null; roles: string[] };

declare module "hono" {
  interface ContextVariableMap {
    userContext: UserContext;
  }
}

export const injectUserContext = createMiddleware(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    throw new AppError("UNAUTHENTICATED", "Unauthenticated user session");
  }

  const activeOrg = await auth.api.getFullOrganization({ headers: c.req.raw.headers });

  if (activeOrg) {
    const currentMember = activeOrg.members.find((member) => member.userId === session.user.id);

    c.set("userContext", {
      mode: "B2B2C",
      user: session.user,
      organizationId: activeOrg.id,
      roles: currentMember ? [currentMember.role] : [],
    });
  } else {
    c.set("userContext", {
      mode: "B2C",
      user: session.user,
      organizationId: null,
      roles: [],
    });
  }

  await next();
});

/**
 * Narrows `UserContext` to its B2B2C member, throwing if the caller has no active
 * organization. This is TypeScript narrowing glue, not a reusable authorization gate —
 * Hono's context typing doesn't narrow across a middleware/handler boundary, so a route
 * needing `organizationId` still needs this one call even after `injectUserContext` has
 * already run. Kept out of `requirePermission` since that gate is about *what a member
 * can do*, not *whether an org exists at all*.
 */
export function requireOrgContext(
  userContext: UserContext,
  message = "This action requires an active organization",
) {
  if (userContext.mode !== "B2B2C") {
    throw new AppError("VALIDATION_ERROR", message);
  }
  return userContext;
}
