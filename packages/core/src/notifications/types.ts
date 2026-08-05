export type NotificationPayload = {
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export interface NotificationDispatcher<TClient = unknown> {
  registerClient(userId: string, client: TClient): void;
  // Takes the specific client to remove, not just userId — a user can have more than
  // one live connection (multiple tabs/devices) sharing the same userId. Removing by
  // userId alone can't tell those apart, and would delete whichever connection happens
  // to be registered at that moment, not necessarily the one that actually closed.
  removeClient(userId: string, client: TClient): void;
  send(userId: string, payload: NotificationPayload): Promise<void>;
}

/**
 * A persisted notification, exactly as stored — what a `NotificationChannel` receives
 * to deliver. Deliberately not the same type as `NotificationPayload` above:
 * `NotificationPayload` is what a live WebSocket message carries (ephemeral, no id);
 * this is the durable row a channel might need more from (e.g. `id` for an unsubscribe
 * link, `actionUrl` for a deep link).
 */
export interface NotificationRecord {
  id: string;
  userId: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  createdAt: Date;
}

/**
 * One delivery mechanism — WebSocket push, email, mobile/web push, SMS, whatever comes
 * later. `notifications.service.ts`'s `notifyUser` holds a list of these and calls
 * every one, independently, after the notification is already durably persisted (see
 * specs/notifications-plan.md) — a channel failing here never loses the notification,
 * only that channel's delivery attempt. Adding a new channel later means writing one
 * new class implementing this interface and adding it to that list — zero changes to
 * `notifyUser` itself, zero changes to any event's trigger call site.
 */
export interface NotificationChannel {
  readonly name: string;
  deliver(userId: string, notification: NotificationRecord): Promise<void>;
}
