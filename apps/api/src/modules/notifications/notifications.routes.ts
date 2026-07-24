import { Hono } from "hono";
import type { createNodeWebSocket } from "@hono/node-ws";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requireAllowedOrigin } from "../../middleware/origin.middleware";
import { requireSelfParam } from "../../middleware/self-param.middleware";
import { notificationSocketHandler } from "./notifications.controller";

type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];

export function createNotificationsRoutes(upgradeWebSocket: UpgradeWebSocket) {
  return new Hono().get(
    "/:userId",
    requireAllowedOrigin,
    injectUserContext,
    requireSelfParam("userId", "Cannot open a notification socket for another user"),
    upgradeWebSocket(notificationSocketHandler),
  );
}
