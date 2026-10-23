import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { db, eq, inArray, user as userTable } from "@repo/db";
import { registerEmailSender, type EmailSender, type OutgoingEmail } from "@repo/core";
import { app } from "../../app";

// Verification email end to end: real Better Auth endpoints and database, with a capturing
// sender registered in place of the console one (same pattern as email.integration.test.ts).

const PORT = 8817;
const ORIGIN = "http://localhost:3002";
const BASE = `http://localhost:${PORT}/api/auth`;
const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3002";

let server: ServerType;
const cleanupUserIds: string[] = [];
let sent: OutgoingEmail[] = [];
const capturing: EmailSender = { send: async (email) => void sent.push(email) };

function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: ORIGIN,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function signUp() {
  const email = `verify-test-${randomUUID()}@example.com`;
  const res = await post("/sign-up/email", {
    email,
    password: "verify-password-1",
    name: "Verify Test",
  });
  const body = (await res.json()) as { user: { id: string } };
  cleanupUserIds.push(body.user.id);
  return { email, userId: body.user.id, res };
}

// Sends are fire-and-forget, so an email can land just after the response.
async function emailsTo(address: string, { atLeast = 1, waitMs = 3000 } = {}) {
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    const matching = sent.filter((e) => e.to === address);
    if (matching.length >= atLeast) return matching;
    await new Promise((r) => setTimeout(r, 25));
  }
  return sent.filter((e) => e.to === address);
}

function linkIn(email: OutgoingEmail): URL {
  const match = email.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`no link in "${email.subject}"`);
  return new URL(match[0]);
}

async function isVerified(userId: string) {
  const [row] = await db
    .select({ emailVerified: userTable.emailVerified })
    .from(userTable)
    .where(eq(userTable.id, userId));
  return row?.emailVerified;
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

beforeEach(() => {
  sent = [];
  registerEmailSender(capturing);
});

afterAll(async () => {
  if (cleanupUserIds.length)
    await db.delete(userTable).where(inArray(userTable.id, cleanupUserIds));
  await new Promise((resolve) => server.close(resolve));
});

describe("Verification email", () => {
  it("sends one verification email on sign-up, and its link verifies the account", async () => {
    const { email, userId } = await signUp();

    const [message, ...extra] = await emailsTo(email);
    expect(extra).toHaveLength(0);
    expect(message!.subject).toMatch(/verify/i);
    expect(await isVerified(userId)).toBe(false);

    const link = linkIn(message!);
    // The link is the API's verify endpoint (it's what marks the account verified); where it
    // lands afterwards comes from config, not the client.
    expect(`${link.origin}${link.pathname}`).toBe(
      `${process.env.BETTER_AUTH_URL}/api/auth/verify-email`,
    );
    expect(link.searchParams.get("callbackURL")).toBe(`${PORTAL_URL}/auth/email-verified`);

    // Same server, this test's port (BETTER_AUTH_URL points at the dev API's port).
    const verify = await fetch(`${BASE}/verify-email${link.search}`, { redirect: "manual" });
    expect(verify.status).toBe(302);
    expect(verify.headers.get("location")).toBe(`${PORTAL_URL}/auth/email-verified`);
    expect(await isVerified(userId)).toBe(true);
  }, 30000);

  it("ignores a client-supplied callbackURL: the link always lands on the portal", async () => {
    const email = `verify-test-${randomUUID()}@example.com`;
    const res = await post("/sign-up/email", {
      email,
      password: "verify-password-1",
      name: "Verify Test",
      callbackURL: "http://localhost:3000/somewhere-else",
    });
    cleanupUserIds.push(((await res.json()) as { user: { id: string } }).user.id);

    const [message] = await emailsTo(email);
    expect(linkIn(message!).searchParams.get("callbackURL")).toBe(
      `${PORTAL_URL}/auth/email-verified`,
    );
  }, 30000);

  it("resends the verification email on request", async () => {
    const { email } = await signUp();
    await emailsTo(email);
    sent = [];

    const res = await post("/send-verification-email", { email });
    expect(res.status).toBe(200);
    expect(await emailsTo(email)).toHaveLength(1);
  }, 30000);

  it("doesn't fail sign-up when the sender fails", async () => {
    registerEmailSender({
      send: async () => {
        throw new Error("provider down");
      },
    });

    const { res } = await signUp();
    expect(res.status).toBe(200);
  }, 30000);
});
