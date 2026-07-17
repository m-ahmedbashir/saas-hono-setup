import { createMiddleware } from "hono/factory";
import { AppError } from "@repo/core";
import { allowedOrigins } from "../lib/allowed-origins";

/**
 * WS handshakes aren't subject to CORS the way fetch is — the browser attaches
 * cookies regardless of origin, so this is the manual equivalent of the CORS check,
 * required on any WebSocket route. Without it, cross-site WebSocket hijacking is only
 * prevented by the session cookie's SameSite=Lax default, which is a client-side
 * accident, not a server-side control (see AGENTS.md's auth model section).
 */
export const requireAllowedOrigin = createMiddleware(async (c, next) => {
  const origin = c.req.header("origin");
  if (!origin || !allowedOrigins.includes(origin)) {
    throw new AppError("FORBIDDEN", "Origin not allowed");
  }
  await next();
});
