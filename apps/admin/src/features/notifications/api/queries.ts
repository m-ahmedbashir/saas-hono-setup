import { queryOptions } from "@tanstack/react-query";
import { getNotifications } from "./service";
import type { NotificationListFilters } from "./service";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (filters: NotificationListFilters) => [...notificationKeys.all, "list", filters] as const,
};

export const notificationsQueryOptions = (
  filters: NotificationListFilters = {},
  headers?: Record<string, string>,
) =>
  queryOptions({
    queryKey: notificationKeys.list(filters),
    queryFn: () => getNotifications(filters, headers),
  });
