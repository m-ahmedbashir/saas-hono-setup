import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { markNotificationRead, markAllNotificationsRead } from "./service";
import { notificationKeys } from "./queries";

const invalidateNotifications = () => {
  getQueryClient().invalidateQueries({ queryKey: notificationKeys.all });
};

export const markNotificationReadMutation = mutationOptions({
  mutationFn: (id: string) => markNotificationRead(id),
  onSettled: (_data, error) => {
    if (!error) invalidateNotifications();
  },
});

export const markAllNotificationsReadMutation = mutationOptions({
  mutationFn: () => markAllNotificationsRead(),
  onSettled: (_data, error) => {
    if (!error) invalidateNotifications();
  },
});
