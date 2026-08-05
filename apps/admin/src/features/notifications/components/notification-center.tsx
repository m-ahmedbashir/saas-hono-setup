"use client";

import { Icons } from "@/components/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { NotificationCard } from "@/components/ui/notification-card";
import { notificationsQueryOptions } from "../api/queries";
import { markNotificationReadMutation, markAllNotificationsReadMutation } from "../api/mutations";
import { useNotificationSocket } from "../hooks/use-notification-socket";

const MAX_VISIBLE = 5;

export function NotificationCenter() {
  // The one always-mounted place (every dashboard page renders the header) that keeps
  // the live WebSocket connection open — see use-notification-socket.ts's doc comment.
  useNotificationSocket();

  const router = useRouter();
  const { data } = useQuery(notificationsQueryOptions({ limit: MAX_VISIBLE }));
  const markRead = useMutation(markNotificationReadMutation);
  const markAllRead = useMutation(markAllNotificationsReadMutation);

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative h-8 w-8" />}>
        <Icons.notification className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-medium">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
        <span className="sr-only">Notifications</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[calc(100vw-2rem)] p-0 sm:w-[380px]" sideOffset={8}>
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard/notifications" className="group flex items-center gap-1">
            <h4 className="text-sm font-semibold group-hover:underline">Notifications</h4>
            <Icons.chevronRight className="text-muted-foreground h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">
                {unreadCount} new
              </span>
            )}
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground h-auto px-2 py-1 text-xs"
                onClick={() => markAllRead.mutate()}
              >
                Mark all as read
              </Button>
            )}
          </div>
        </div>
        <Separator />
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Icons.notification className="text-muted-foreground/40 mb-2 h-8 w-8" />
              <p className="text-muted-foreground text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1 p-2">
              {notifications.map((notification) => (
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
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
