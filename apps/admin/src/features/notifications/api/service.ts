import { unwrap } from "@repo/shared/api-response";
import { api } from "@/lib/api";

// Every request/response type here is derived from apps/api's /notifications routes
// (AppType), never hand-written.
const notifications = api.notifications;

// The page's paging/unread state; the query string carries it as text.
export interface NotificationListFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

// `headers` only for server-side prefetches forwarding the incoming request's cookie.
export async function getNotifications(
  filters: NotificationListFilters = {},
  headers?: Record<string, string>,
) {
  return unwrap(
    await notifications.$get(
      {
        query: {
          page: filters.page ? String(filters.page) : undefined,
          limit: filters.limit ? String(filters.limit) : undefined,
          unreadOnly:
            filters.unreadOnly === undefined ? undefined : filters.unreadOnly ? "true" : "false",
        },
      },
      { headers },
    ),
  );
}

export async function markNotificationRead(id: string) {
  return unwrap(await notifications[":id"].read.$patch({ param: { id } }));
}

export async function markAllNotificationsRead() {
  return unwrap(await notifications["read-all"].$post());
}

export type Notification = Awaited<ReturnType<typeof getNotifications>>["notifications"][number];
