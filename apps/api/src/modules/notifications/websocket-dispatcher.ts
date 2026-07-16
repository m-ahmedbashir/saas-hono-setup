import type { WSContext } from "hono/ws";
import type { NotificationDispatcher, NotificationPayload } from "@repo/core";

class HonoWebSocketNotificationDispatcher implements NotificationDispatcher<WSContext> {
  private clients = new Map<string, WSContext>();

  registerClient(userId: string, client: WSContext): void {
    this.clients.set(userId, client);
  }

  removeClient(userId: string): void {
    this.clients.delete(userId);
  }

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    const client = this.clients.get(userId);
    if (client && client.readyState === 1) {
      client.send(JSON.stringify(payload));
    }
  }
}

export const notificationDispatcher = new HonoWebSocketNotificationDispatcher();
