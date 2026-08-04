import { apiFetch } from "@/lib/api-client";
import type { Notification, NotificationListFilters, NotificationsResponse } from "./types";

export async function getNotifications(
  filters: NotificationListFilters = {},
  headers?: HeadersInit,
): Promise<NotificationsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.unreadOnly !== undefined) params.set("unreadOnly", String(filters.unreadOnly));
  const query = params.toString();

  return apiFetch<NotificationsResponse>(`/notifications${query ? `?${query}` : ""}`, { headers });
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return apiFetch<Notification>(`/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(): Promise<{ success: true }> {
  return apiFetch<{ success: true }>("/notifications/read-all", { method: "POST" });
}
