import type { WSContext } from "hono/ws";
import type { NotificationDispatcher, NotificationPayload } from "@repo/core";

class HonoWebSocketNotificationDispatcher implements NotificationDispatcher<WSContext> {
  // A Set per userId, not a single WSContext — a user can have more than one live
  // connection (multiple tabs/devices) at once. A single-value map would let a second
  // connection silently overwrite the first's registration, and then closing the
  // *first* connection would delete the *second*'s still-open entry from the map,
  // leaving a live socket that never receives anything again.
  private clients = new Map<string, Set<WSContext>>();

  registerClient(userId: string, client: WSContext): void {
    const existing = this.clients.get(userId);
    if (existing) {
      existing.add(client);
    } else {
      this.clients.set(userId, new Set([client]));
    }
  }

  removeClient(userId: string, client: WSContext): void {
    const existing = this.clients.get(userId);
    if (!existing) return;

    existing.delete(client);
    if (existing.size === 0) {
      this.clients.delete(userId);
    }
  }

  async send(userId: string, payload: NotificationPayload): Promise<void> {
    const clients = this.clients.get(userId);
    if (!clients) return;

    const message = JSON.stringify(payload);
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}

export const notificationDispatcher = new HonoWebSocketNotificationDispatcher();
