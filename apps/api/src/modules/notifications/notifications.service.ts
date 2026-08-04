import { db, withUserScope, insertNotification, user, inArray } from "@repo/db";
import { platformRoles } from "@repo/core/auth/platform-permissions";
import type { NotificationChannel, NotificationRecord } from "@repo/core";
import {
  listNotificationsByUser,
  countNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "./notifications.db";
import { websocketChannel } from "./channels/websocket-channel";

// One line to add a future channel (email, push, ...) — see
// packages/core/src/notifications/types.ts's NotificationChannel doc comment. Nothing
// else in this file, or any of this module's callers, needs to change when it grows.
const channels: NotificationChannel[] = [websocketChannel];

export interface NotifyInput {
  title: string;
  body: string;
  actionUrl?: string;
}

/**
 * The one funnel every "something important happened" call site in this app uses.
 * Persists first, always — a channel failing below never loses the notification,
 * only that channel's delivery attempt for it (see specs/notifications-plan.md's
 * persist-then-push ordering). `withUserScope`, not `withSystemScope`: this is a
 * genuinely per-user-owned row, same reasoning as `profile`/`individual_billing`.
 */
export async function notifyUser(userId: string, input: NotifyInput): Promise<void> {
  const record: NotificationRecord = await withUserScope(userId, (tx) =>
    insertNotification(tx, {
      id: crypto.randomUUID(),
      userId,
      title: input.title,
      body: input.body,
      actionUrl: input.actionUrl,
    }),
  );

  // allSettled, not all — one channel throwing must never stop the others, and never
  // matters to the caller either way, since persistence already succeeded above.
  await Promise.allSettled(channels.map((channel) => channel.deliver(userId, record)));
}

export async function notifyUsers(userIds: string[], input: NotifyInput): Promise<void> {
  await Promise.all(userIds.map((userId) => notifyUser(userId, input)));
}

/**
 * Platform staff recipient resolver — same role set platform-permissions.ts's
 * `platformRoles` defines, same query shape platform-individuals.db.ts's
 * `PLATFORM_STAFF_ROLES` already uses for the inverse (non-staff) filter. `user` has
 * no RLS policy (Better-Auth-generated, see AGENTS.md), so the bare `db` client is
 * correct here, same as every other platform-wide staff-role query in this app.
 */
export async function getPlatformStaffUserIds(): Promise<string[]> {
  const staffRoles = Object.keys(platformRoles);
  const rows = await db.select({ id: user.id }).from(user).where(inArray(user.role, staffRoles));
  return rows.map((row) => row.id);
}

export interface ListNotificationsResult {
  notifications: NotificationRecord[];
  total: number;
  unreadCount: number;
}

export async function listMyNotifications(
  userId: string,
  filters: { page: number; limit: number; unreadOnly?: boolean },
): Promise<ListNotificationsResult> {
  return withUserScope(userId, async (tx) => {
    const [notifications, total, unreadCount] = await Promise.all([
      listNotificationsByUser(tx, userId, filters),
      countNotifications(tx, userId, { unreadOnly: filters.unreadOnly }),
      countNotifications(tx, userId, { unreadOnly: true }),
    ]);
    return { notifications, total, unreadCount };
  });
}

export async function markMyNotificationAsRead(
  userId: string,
  id: string,
): Promise<NotificationRecord | null> {
  return withUserScope(userId, (tx) => markNotificationRead(tx, userId, id));
}

export async function markAllMyNotificationsAsRead(userId: string): Promise<void> {
  await withUserScope(userId, (tx) => markAllNotificationsRead(tx, userId));
}
