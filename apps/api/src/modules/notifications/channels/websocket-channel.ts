import type { NotificationChannel, NotificationRecord } from "@repo/core";
import { notificationDispatcher } from "../websocket-dispatcher";

// Wraps the existing, already-built WS dispatcher as one implementation of the
// general NotificationChannel contract — the only channel that exists today. Adding
// email/push later means writing a sibling file here and adding it to
// notifications.service.ts's `channels` array; this file doesn't change.
export const websocketChannel: NotificationChannel = {
  name: "websocket",
  deliver: (userId: string, record: NotificationRecord) =>
    notificationDispatcher.send(userId, {
      title: record.title,
      body: record.body,
      metadata: record.actionUrl ? { actionUrl: record.actionUrl } : undefined,
    }),
};
