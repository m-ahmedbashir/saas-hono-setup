export type NotificationPayload = {
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export interface NotificationDispatcher<TClient = unknown> {
  registerClient(userId: string, client: TClient): void;
  removeClient(userId: string): void;
  send(userId: string, payload: NotificationPayload): Promise<void>;
}
