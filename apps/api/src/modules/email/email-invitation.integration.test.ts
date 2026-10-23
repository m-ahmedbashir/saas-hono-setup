import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  inArray,
  invitation as invitationTable,
  member as memberTable,
  organization as organizationTable,
  user as userTable,
} from "@repo/db";
import { registerEmailSender, type EmailSender, type OutgoingEmail } from "@repo/core";
import { app } from "../../app";

// Invitation emails end to end through Better Auth's own invite-member route, with a
// capturing sender registered in place of the console one (same pattern as
// email.integration.test.ts).

const PORT = 8818;
const ORIGIN = "http://localhost:3002";
const BASE = `http://localhost:${PORT}/api/auth`;
const PORTAL_URL = process.env.PORTAL_URL ?? "http://localhost:3002";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];
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

async function ownerWithOrg() {
  const email = `invite-owner-${randomUUID()}@example.com`;
  const res = await post("/sign-up/email", { email, password: "password1234", name: "Ada Owner" });
  const body = (await res.json()) as { user: { id: string } };
  cleanupUserIds.push(body.user.id);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;

  const orgRes = await post(
    "/organization/create",
    { name: "Acme Invites", slug: `acme-invites-${randomUUID()}` },
    cookie,
  );
  const org = (await orgRes.json()) as { id: string };
  cleanupOrgIds.push(org.id);
  return { cookie, organizationId: org.id };
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

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

beforeEach(() => {
  sent = [];
  registerEmailSender(capturing);
});

afterAll(async () => {
  if (cleanupOrgIds.length) {
    await db.delete(memberTable).where(inArray(memberTable.organizationId, cleanupOrgIds));
    // Cascades each org's invitations, billing row and profile.
    await db.delete(organizationTable).where(inArray(organizationTable.id, cleanupOrgIds));
  }
  if (cleanupUserIds.length)
    await db.delete(userTable).where(inArray(userTable.id, cleanupUserIds));
  await new Promise((resolve) => server.close(resolve));
});

describe("Invitation email", () => {
  it("emails the invitee one link to the portal's accept-invite page for that invitation", async () => {
    const { cookie, organizationId } = await ownerWithOrg();
    const inviteeEmail = `invitee-${randomUUID()}@example.com`;

    const res = await post(
      "/organization/invite-member",
      { organizationId, email: inviteeEmail, role: "member" },
      cookie,
    );
    expect(res.status).toBe(200);
    const invitation = (await res.json()) as { id: string };

    const [message, ...extra] = await emailsTo(inviteeEmail);
    expect(extra).toHaveLength(0);
    expect(message!.subject).toContain("Acme Invites");
    expect(message!.text).toContain("Ada Owner");

    const link = new URL(message!.text.match(/https?:\/\/\S+/)![0]);
    expect(`${link.origin}${link.pathname}`).toBe(`${PORTAL_URL}/auth/accept-invite`);
    expect(link.searchParams.get("id")).toBe(invitation.id);
  }, 30000);

  it("still creates the invitation when the sender fails", async () => {
    const { cookie, organizationId } = await ownerWithOrg();
    registerEmailSender({
      send: async () => {
        throw new Error("provider down");
      },
    });
    const inviteeEmail = `invitee-${randomUUID()}@example.com`;

    const res = await post(
      "/organization/invite-member",
      { organizationId, email: inviteeEmail, role: "member" },
      cookie,
    );
    expect(res.status).toBe(200);
    const invitation = (await res.json()) as { id: string };

    const [row] = await db
      .select({ id: invitationTable.id, status: invitationTable.status })
      .from(invitationTable)
      .where(eq(invitationTable.id, invitation.id));
    expect(row?.status).toBe("pending");
  }, 30000);
});
