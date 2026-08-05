import { notification, eq, and, desc, count, type DbExecutor } from "@repo/db";

// Every function here requires an explicit `tx` — a `withUserScope`/`withSystemScope`
// transaction executor from @repo/db, never the bare `db` client — same reasoning as
// every other RLS-enabled table's .db.ts file. The insert itself lives in
// packages/db/src/notifications.ts, not here — it also needs to be reachable from
// packages/core (see that file's own comment); this file owns the REST-serving query
// surface (list/markRead/countUnread) that only apps/api needs.

export interface NotificationListFilters {
  page: number;
  limit: number;
  unreadOnly?: boolean;
}

export async function listNotificationsByUser(
  tx: DbExecutor,
  userId: string,
  filters: NotificationListFilters,
) {
  const offset = (filters.page - 1) * filters.limit;
  const conditions = [eq(notification.userId, userId)];
  if (filters.unreadOnly) conditions.push(eq(notification.read, false));

  return tx
    .select()
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(filters.limit)
    .offset(offset);
}

export async function countNotifications(
  tx: DbExecutor,
  userId: string,
  filters: { unreadOnly?: boolean } = {},
): Promise<number> {
  const conditions = [eq(notification.userId, userId)];
  if (filters.unreadOnly) conditions.push(eq(notification.read, false));

  const [row] = await tx
    .select({ value: count() })
    .from(notification)
    .where(and(...conditions));
  return row?.value ?? 0;
}

export async function markNotificationRead(tx: DbExecutor, userId: string, id: string) {
  const [updated] = await tx
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function markAllNotificationsRead(tx: DbExecutor, userId: string): Promise<void> {
  await tx
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.userId, userId), eq(notification.read, false)));
}
