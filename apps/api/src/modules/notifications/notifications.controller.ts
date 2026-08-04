import type { Context } from "hono";
import type { WSEvents } from "hono/ws";
import { AppError } from "@repo/core";
import { notificationDispatcher } from "./websocket-dispatcher";
import {
  listMyNotifications,
  markMyNotificationAsRead,
  markAllMyNotificationsAsRead,
} from "./notifications.service";
import { success } from "../../lib/response";
import type { ValidatedQueryContext } from "../../lib/validated-context";
import type { listNotificationsQuerySchema } from "./notifications.schema";

export function notificationSocketHandler(c: Context): WSEvents {
  const userId = c.req.param("userId");
  if (!userId) {
    throw new AppError("VALIDATION_ERROR", "Missing userId in WebSocket route");
  }

  return {
    onOpen: (_evt, ws) => {
      notificationDispatcher.registerClient(userId, ws);
    },
    onClose: (_evt, ws) => {
      notificationDispatcher.removeClient(userId, ws);
    },
  };
}

// No requirePermission/requirePlatformPermission on any of these three — a
// notification is the caller's own, an ownership concept, not a role one, same
// reasoning as profile.controller.ts. Works identically regardless of whether the
// caller is an individual, an org member, or platform staff.
export async function listNotificationsHandler(
  c: ValidatedQueryContext<typeof listNotificationsQuerySchema>,
) {
  const userContext = c.get("userContext");
  const { page, limit, unreadOnly } = c.req.valid("query");
  const result = await listMyNotifications(userContext.user.id, { page, limit, unreadOnly });

  return success(c, result);
}

export async function markNotificationReadHandler(c: Context) {
  const userContext = c.get("userContext");
  // Pulled out of the same .patch("/:id/read", ...) chain it's registered in, so
  // TypeScript can't narrow param() to a guaranteed string the way it can inline —
  // same reasoning as this repo's other controllers pulled out of their route chains.
  const id = c.req.param("id")!;

  const updated = await markMyNotificationAsRead(userContext.user.id, id);
  if (!updated) {
    // Covers both "no such notification" and "exists but belongs to someone else" —
    // RLS already made the update a no-op for the latter case before this ever runs,
    // so there's no way to distinguish them, and no reason a caller should be able to.
    throw new AppError("NOT_FOUND", "Notification not found");
  }

  return success(c, updated);
}

export async function markAllNotificationsReadHandler(c: Context) {
  const userContext = c.get("userContext");
  await markAllMyNotificationsAsRead(userContext.user.id);

  return success(c, { success: true });
}
