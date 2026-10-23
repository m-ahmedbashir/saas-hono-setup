import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { db, inArray, user as userTable } from "@repo/db";
import { registerEmailSender, type EmailSender, type OutgoingEmail } from "@repo/core";
import { app } from "../../app";

// The auth emails end to end: real Better Auth endpoints, real database, with a capturing
// sender registered in place of the console one (app.ts's auth-wiring registers that at
// import; registering again replaces it).

const PORT = 8816;
const ORIGIN = "http://localhost:3002";
const BASE = `http://localhost:${PORT}/api/auth`;
const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3002";

let server: ServerType;
const cleanupUserIds: string[] = [];
let sent: OutgoingEmail[] = [];
const capturing: EmailSender = { send: async (email) => void sent.push(email) };

function post(path: string, body: unknown, signal?: AbortSignal) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify(body),
    signal,
  });
}

async function signUp(password = "original-password-1") {
  const email = `email-test-${randomUUID()}@example.com`;
  const res = await post("/sign-up/email", { email, password, name: "Email Test" });
  const body = (await res.json()) as { user: { id: string } };
  cleanupUserIds.push(body.user.id);
  return { email, password };
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

describe("Password reset email", () => {
  it("emails a portal reset link whose token sets a new password, retiring the old one", async () => {
    const { email, password } = await signUp();
    sent = [];

    const res = await post("/request-password-reset", { email });
    expect(res.status).toBe(200);

    const [message, ...extra] = await emailsTo(email);
    expect(extra).toHaveLength(0);
    expect(message!.subject).toMatch(/reset/i);
    const link = linkIn(message!);
    expect(`${link.origin}${link.pathname}`).toBe(`${PORTAL_URL}/auth/reset-password`);
    const token = link.searchParams.get("token");
    expect(token).toBeTruthy();

    const reset = await post("/reset-password", { newPassword: "brand-new-password-2", token });
    expect(reset.status).toBe(200);

    expect((await post("/sign-in/email", { email, password })).status).toBe(401);
    expect((await post("/sign-in/email", { email, password: "brand-new-password-2" })).status).toBe(
      200,
    );
  }, 30000);

  it("answers an unknown address exactly like a known one, and sends nothing", async () => {
    const { email: known } = await signUp();
    const unknown = `nobody-${randomUUID()}@example.com`;

    const knownRes = await post("/request-password-reset", { email: known });
    const unknownRes = await post("/request-password-reset", { email: unknown });

    expect(unknownRes.status).toBe(knownRes.status);
    expect(await unknownRes.json()).toEqual(await knownRes.json());
    await emailsTo(known);
    expect(await emailsTo(unknown, { waitMs: 500 })).toHaveLength(0);
  }, 30000);

  // Awaiting the send would make a known address answer measurably slower than an unknown
  // one, letting anyone probe which emails have accounts.
  it("responds without waiting for the email to be delivered", async () => {
    const { email } = await signUp();
    let release!: () => void;
    const delivered = new Promise<void>((resolve) => (release = resolve));
    registerEmailSender({ send: () => delivered });

    // A hook that awaited delivery would hang on this never-delivered email: abort instead.
    const res = await post("/request-password-reset", { email }, AbortSignal.timeout(3000));
    release();

    expect(res.status).toBe(200);
  }, 30000);

  it("still succeeds when the sender fails", async () => {
    const { email } = await signUp();
    registerEmailSender({
      send: async () => {
        throw new Error("provider down");
      },
    });

    expect((await post("/request-password-reset", { email })).status).toBe(200);
  }, 30000);
});
