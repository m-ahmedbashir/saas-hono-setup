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
