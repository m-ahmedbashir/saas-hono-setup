import { createMiddleware } from "hono/factory";
import { AppError } from "@repo/core";

/** Requires injectUserContext to have run first. Rejects unless the given path param equals the authenticated user's id. */
export const requireSelfParam = (
  paramName: string,
  message = `Cannot act on another user's ${paramName}`,
) =>
  createMiddleware(async (c, next) => {
    const userContext = c.get("userContext");
    if (!userContext) {
      throw new AppError(
        "INTERNAL_ERROR",
        "requireSelfParam used without injectUserContext running first",
      );
    }
    if (userContext.user.id !== c.req.param(paramName)) {
      throw new AppError("FORBIDDEN", message);
    }
    await next();
  });
