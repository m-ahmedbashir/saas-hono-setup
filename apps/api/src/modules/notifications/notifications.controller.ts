import type { Context } from "hono";
import type { WSEvents } from "hono/ws";
import { AppError } from "@repo/core";
import { notificationDispatcher } from "./websocket-dispatcher";

export function notificationSocketHandler(c: Context): WSEvents {
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
}
