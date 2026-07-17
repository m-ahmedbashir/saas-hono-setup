import { Hono } from "hono";
import type { createNodeWebSocket } from "@hono/node-ws";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requireAllowedOrigin } from "../../middleware/origin.middleware";
import { requireSelfParam } from "../../middleware/self-param.middleware";
import { notificationDispatcher } from "./websocket-dispatcher";

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];

export function createNotificationsRoutes(upgradeWebSocket: UpgradeWebSocket) {
  return new Hono().get(
    "/:userId",
    requireAllowedOrigin,
    injectUserContext,
    requireSelfParam("userId", "Cannot open a notification socket for another user"),
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
