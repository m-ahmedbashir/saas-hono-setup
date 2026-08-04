// Mirrors apps/api's NotificationRecord (packages/core/src/notifications/types.ts) plus
// the `read` flag every listed row actually carries (the core type only declares the
// fields a NotificationChannel needs, not the REST list shape) and
// notifications.service.ts's ListNotificationsResult.
export interface Notification {
  id: string;
  title: string;
  body: string;
  actionUrl: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListFilters {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export interface NotificationsResponse {
  notifications: Notification[];
  total: number;
  unreadCount: number;
}
