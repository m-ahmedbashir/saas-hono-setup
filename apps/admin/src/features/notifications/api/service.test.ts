import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "./service";

// Mocks only global fetch — the service, client and envelope unwrapping run for real. Pins
// the exact requests sent, so swapping the transport can't silently change them.
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function sent(index = 0) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return {
    url: String(url),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    credentials: init?.credentials,
  };
}

const base = "http://localhost:8787/notifications";

describe("notifications service", () => {
  it("lists with paging and the unread filter as query params, forwarding a server-side cookie", async () => {
    fetchMock.mockResolvedValue(ok({ notifications: [], total: 0, unreadCount: 0 }));

    const result = await getNotifications(
      { page: 2, limit: 10, unreadOnly: false },
      { Cookie: "session=abc" },
    );

    expect(result).toEqual({ notifications: [], total: 0, unreadCount: 0 });
    const req = sent();
    expect(req.url).toBe(`${base}?page=2&limit=10&unreadOnly=false`);
    expect(req.headers.get("Cookie")).toBe("session=abc");
    expect(req.credentials).toBe("include");
  });

  it("omits unset filters", async () => {
    fetchMock.mockResolvedValue(ok({ notifications: [], total: 0, unreadCount: 0 }));

    await getNotifications();

    expect(sent().url).toMatch(new RegExp(`^${base}\\??$`));
  });

  it("marks one notification read with a PATCH", async () => {
    fetchMock.mockResolvedValue(ok({ id: "n1", read: true }));

    const result = await markNotificationRead("n1");

    expect(result).toMatchObject({ id: "n1", read: true });
    expect(sent()).toMatchObject({ url: `${base}/n1/read`, method: "PATCH" });
  });

  it("marks all read with a POST", async () => {
    fetchMock.mockResolvedValue(ok({ success: true }));

    await markAllNotificationsRead();

    expect(sent()).toMatchObject({ url: `${base}/read-all`, method: "POST" });
  });
});
