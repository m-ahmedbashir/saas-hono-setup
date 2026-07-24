import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import WebSocket from "ws";
import { db, eq, user as userTable } from "@repo/db";
import { app, injectWebSocket } from "../../app";
import { notificationDispatcher } from "./websocket-dispatcher";

// Hits the real dev database (packages/db's `db` client, same as `pnpm dev`) — there is
// no isolated test database in this repo yet. See PROGRESS.md. Keep this test's footprint
// self-contained: create exactly one user, delete it in afterAll, no shared fixtures.

const PORT = 8799;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let userId: string;
let sessionCookie: string;

beforeAll(async () => {
  server = serve({ fetch: app.fetch, port: PORT });
  injectWebSocket(server);

  const email = `ws-integration-test-${Date.now()}@example.com`;
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "WS Integration Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  userId = body.user.id;

  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  sessionCookie = setCookie.split(";")[0]!;
});

afterAll(async () => {
  await db.delete(userTable).where(eq(userTable.id, userId));
  await new Promise((resolve) => server.close(resolve));
});

function attemptConnection(
  targetUserId: string,
  origin: string = ORIGIN,
): Promise<{ status?: number; ws?: WebSocket }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws/${targetUserId}`, {
      headers: { Cookie: sessionCookie, Origin: origin },
    });
    ws.on("open", () => resolve({ ws }));
    ws.on("unexpected-response", (_req, res) => resolve({ status: res.statusCode }));
  });
}

describe("WS auth guardrail on /ws/:userId", () => {
  it("rejects a connection from a disallowed origin, even with a valid session and matching :userId", async () => {
    const { status, ws } = await attemptConnection(userId, "https://attacker.example");

    expect(status).toBe(403);
    ws?.close();
  });

  it("rejects a connection whose session does not match the requested :userId", async () => {
    const { status, ws } = await attemptConnection("some-unrelated-user-id");

    expect(status).toBe(403);
    ws?.close();
  });

  it("accepts a matching connection and delivers a real message sent via notificationDispatcher", async () => {
    const { ws, status } = await attemptConnection(userId);

    expect(status).toBeUndefined();
    expect(ws).toBeDefined();

    const messageReceived = new Promise((resolve) => {
      ws!.once("message", (data) => resolve(JSON.parse(data.toString())));
    });

    await notificationDispatcher.send(userId, {
      title: "Success!",
      body: "Your process is complete.",
    });

    await expect(messageReceived).resolves.toEqual({
      title: "Success!",
      body: "Your process is complete.",
    });

    ws!.close();
  });

  it("keeps a second connection (e.g. a second tab) reachable after the first closes", async () => {
    // Regression test for a real bug: the dispatcher used to key one WSContext per
    // userId, so a second connection silently overwrote the first's registration, and
    // closing the *first* connection then deleted the *second*'s still-open entry —
    // leaving a live socket that would never receive anything again.
    const first = await attemptConnection(userId);
    const second = await attemptConnection(userId);
    expect(first.ws).toBeDefined();
    expect(second.ws).toBeDefined();

    await new Promise<void>((resolve) => {
      first.ws!.once("close", () => resolve());
      first.ws!.close();
    });

    const messageReceived = new Promise((resolve) => {
      second.ws!.once("message", (data) => resolve(JSON.parse(data.toString())));
    });

    await notificationDispatcher.send(userId, {
      title: "Still here",
      body: "The second connection should still get this.",
    });

    await expect(messageReceived).resolves.toEqual({
      title: "Still here",
      body: "The second connection should still get this.",
    });

    second.ws!.close();
  });
});
