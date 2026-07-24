import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  organization as organizationTable,
  user as userTable,
  organizationBilling,
  organizationProfile,
  withSystemScope,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Hits the real dev database, same pattern as the other integration test files. The
// second test below is the reason this feature exists in this shape — it directly
// proves the GDPR-relevant property: deleting an org must not touch any member's own
// account. See organization.service.ts's doc comment for the reasoning.

const PORT = 8807;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Organization Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

async function createOrg(ownerCookie: string, name: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
    body: JSON.stringify({
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    }),
  });
  const org = (await res.json()) as { id: string };
  return org.id;
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  await withSystemScope(async (tx) => {
    for (const orgId of cleanupOrgIds) {
      await tx.delete(organizationProfile).where(eq(organizationProfile.organizationId, orgId));
      await tx.delete(organizationBilling).where(eq(organizationBilling.organizationId, orgId));
    }
  });
  for (const orgId of cleanupOrgIds) {
    await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  }
  for (const userId of cleanupUserIds) {
    await db.delete(userTable).where(eq(userTable.id, userId));
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("DELETE /organization", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/organization`, {
      method: "DELETE",
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a member without organization:delete permission", async () => {
    const owner = await signUp(`org-delete-guard-owner-${Date.now()}@example.com`);
    const member = await signUp(`org-delete-guard-member-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId, member.userId);
    const orgId = await createOrg(owner.cookie, "Guarded Org");
    cleanupOrgIds.push(orgId);

    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: orgId },
    });
    await fetch(`http://localhost:${PORT}/api/auth/organization/set-active`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: member.cookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    const res = await fetch(`http://localhost:${PORT}/organization`, {
      method: "DELETE",
      headers: { Origin: ORIGIN, Cookie: member.cookie },
    });
    expect(res.status).toBe(403);
  }, 15000);

  it("deletes the org and its billing/profile even with other members present, but leaves every member's own account untouched (GDPR-relevant)", async () => {
    const owner = await signUp(`org-delete-owner-${Date.now()}@example.com`);
    const member = await signUp(`org-delete-member-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId, member.userId);
    const orgId = await createOrg(owner.cookie, "Doomed Org");

    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: orgId },
    });

    const res = await fetch(`http://localhost:${PORT}/organization`, {
      method: "DELETE",
      headers: { Origin: ORIGIN, Cookie: owner.cookie },
    });
    const body = (await res.json()) as { success: boolean; data: { deleted: boolean } };
    expect(res.status).toBe(200);
    expect(body.data.deleted).toBe(true);

    const [orgRow] = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, orgId));
    expect(orgRow).toBeUndefined();

    const profileRows = await withSystemScope((tx) =>
      tx.select().from(organizationProfile).where(eq(organizationProfile.organizationId, orgId)),
    );
    expect(profileRows).toEqual([]);
    const billingRows = await withSystemScope((tx) =>
      tx.select().from(organizationBilling).where(eq(organizationBilling.organizationId, orgId)),
    );
    expect(billingRows).toEqual([]);

    // The actual GDPR-relevant assertion: both the owner's and the member's own
    // personal accounts survive — deleting the org only ends their membership, never
    // their own data. Each person's own erasure request is theirs alone to make.
    const [ownerRow] = await db.select().from(userTable).where(eq(userTable.id, owner.userId));
    expect(ownerRow).toBeDefined();
    const [memberRow] = await db.select().from(userTable).where(eq(userTable.id, member.userId));
    expect(memberRow).toBeDefined();
  }, 15000);
});
