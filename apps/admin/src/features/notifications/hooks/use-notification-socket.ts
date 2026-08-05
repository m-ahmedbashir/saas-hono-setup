"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { notificationKeys } from "../api/queries";

function wsUrl(userId: string): string {
  // apps/api's /ws/:userId lives on the same host as NEXT_PUBLIC_API_URL, just over the
  // ws(s) scheme instead of http(s) — see apps/api/src/app.ts's `app.route("/ws", ...)`.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "";
  return `${apiUrl.replace(/^http/, "ws")}/ws/${userId}`;
}

/**
 * Live-push half of the notification system — the durable, source-of-truth half is the
 * REST layer (queries.ts/service.ts), which already works with zero WebSocket
 * connection at all (see specs/notifications-plan.md's persist-then-push ordering). This
 * hook only ever treats an incoming message as a "something changed, go refetch" signal;
 * it never trusts the message's own payload as new state, so a dropped/delayed
 * connection can never leave the UI showing stale data once it reconnects and the user
 * next loads /notifications or opens the bell.
 */
export function useNotificationSocket(): void {
  const { data: session } = useSession();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const socket = new WebSocket(wsUrl(userId));
    socket.onmessage = () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    };

    return () => socket.close();
  }, [userId, queryClient]);
}
