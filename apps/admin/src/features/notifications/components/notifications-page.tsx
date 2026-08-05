"use client";

import { Icons } from "@/components/icons";
import PageContainer from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { NotificationCard } from "@/components/ui/notification-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { notificationsQueryOptions } from "../api/queries";
import { markNotificationReadMutation, markAllNotificationsReadMutation } from "../api/mutations";
import type { Notification } from "../api/types";

const PAGE_LIMIT = 50;

export default function NotificationsPage() {
  const router = useRouter();
  const { data, isPending, isError, refetch } = useQuery(
    notificationsQueryOptions({ limit: PAGE_LIMIT }),
  );
  const markRead = useMutation(markNotificationReadMutation);
  const markAllRead = useMutation(markAllNotificationsReadMutation);

  const notifications = data?.notifications ?? [];
  const unreadNotifications = notifications.filter((n) => !n.read);
  const readNotifications = notifications.filter((n) => n.read);

  const renderList = (items: Notification[]) => {
    if (isError) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Icons.alertCircle className="text-destructive mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">We could not load notifications.</p>
          <Button onClick={() => refetch()} className="mt-4" size="sm">
            Retry
          </Button>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16">
          <Icons.notification className="text-muted-foreground/40 mb-3 h-10 w-10" />
          <p className="text-muted-foreground text-sm">No notifications</p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {items.map((notification) => (
          <NotificationCard
            key={notification.id}
            id={notification.id}
            title={notification.title}
            body={notification.body}
            status={notification.read ? "read" : "unread"}
            createdAt={notification.createdAt}
            actions={
              notification.actionUrl
                ? [
                    {
                      id: "view",
                      label: "View",
                      type: "redirect" as const,
                      style: "primary" as const,
                    },
                  ]
                : []
            }
            onMarkAsRead={(id) => markRead.mutate(id)}
            onAction={(id, actionId) => {
              if (actionId === "view" && notification.actionUrl) {
                markRead.mutate(id);
                router.push(notification.actionUrl);
              }
            }}
          />
        ))}
      </div>
    );
  };

  return (
    <PageContainer
      isLoading={isPending}
      pageTitle="Notifications"
      pageDescription="View and manage all your notifications."
      pageHeaderAction={
        (data?.unreadCount ?? 0) > 0 ? (
          <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()}>
            Mark all as read
          </Button>
        ) : undefined
      }
    >
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({notifications.length})</TabsTrigger>
          <TabsTrigger value="unread">Unread ({unreadNotifications.length})</TabsTrigger>
          <TabsTrigger value="read">Read ({readNotifications.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          {renderList(notifications)}
        </TabsContent>
        <TabsContent value="unread" className="mt-4">
          {renderList(unreadNotifications)}
        </TabsContent>
        <TabsContent value="read" className="mt-4">
          {renderList(readNotifications)}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
