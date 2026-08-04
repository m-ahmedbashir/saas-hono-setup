import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import type { createNodeWebSocket } from "@hono/node-ws";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requireAllowedOrigin } from "../../middleware/origin.middleware";
import { requireSelfParam } from "../../middleware/self-param.middleware";
import {
  notificationSocketHandler,
  listNotificationsHandler,
  markNotificationReadHandler,
  markAllNotificationsReadHandler,
} from "./notifications.controller";
import { listNotificationsQuerySchema } from "./notifications.schema";

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

const validateListQuery = zValidator("query", listNotificationsQuerySchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", flattenError(result.error));
  }
});

// Separate from createNotificationsRoutes above (mounted at /ws) on purpose — this is
// the plain REST surface (list/mark-read), mounted at /notifications in app.ts. Same
// ownership-only gate as /profile: injectUserContext only, no requirePermission —
// every handler scopes to the caller's own userId regardless of what kind of account
// they are.
export const notificationsRoutes = new Hono()
  .get("/", injectUserContext, validateListQuery, listNotificationsHandler)
  .patch("/:id/read", injectUserContext, markNotificationReadHandler)
  .post("/read-all", injectUserContext, markAllNotificationsReadHandler);
