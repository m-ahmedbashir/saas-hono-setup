import { Hono } from "hono";
import type { createNodeWebSocket } from "@hono/node-ws";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { notificationDispatcher } from "./websocket-dispatcher";

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];

export function createNotificationsRoutes(upgradeWebSocket: UpgradeWebSocket) {
  return new Hono().get(
    "/:userId",
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
