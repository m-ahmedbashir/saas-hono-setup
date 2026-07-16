import { Hono } from "hono";
import type { createNodeWebSocket } from "@hono/node-ws";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { allowedOrigins } from "../../lib/allowed-origins";
import { notificationDispatcher } from "./websocket-dispatcher";

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];

export function createNotificationsRoutes(upgradeWebSocket: UpgradeWebSocket) {
  return new Hono().get(
    "/:userId",
    async (c, next) => {
      // WS handshakes aren't subject to CORS the way fetch is — the browser attaches
      // cookies regardless of origin, so this is the manual equivalent of the CORS check
      // for this route. Without it, cross-site WebSocket hijacking is only prevented by
      // the session cookie's SameSite=Lax default, which is a client-side accident, not
      // a server-side control (see PROGRESS.md).
      const origin = c.req.header("origin");
      if (!origin || !allowedOrigins.includes(origin)) {
        throw new AppError("FORBIDDEN", "Origin not allowed to open a notification socket");
      }
      await next();
    },
    injectUserContext,
    async (c, next) => {
      const userContext = c.get("userContext");
      if (userContext.user.id !== c.req.param("userId")) {
        throw new AppError("FORBIDDEN", "Cannot open a notification socket for another user");
      }
      await next();
    },
    upgradeWebSocket((c) => {
      const userId = c.req.param("userId");
      if (!userId) {
        throw new AppError("VALIDATION_ERROR", "Missing userId in WebSocket route");
      }
      return {
        onOpen: (_evt, ws) => {
          notificationDispatcher.registerClient(userId, ws);
        },
        onClose: () => {
          notificationDispatcher.removeClient(userId);
        },
      };
    })
  );
}
