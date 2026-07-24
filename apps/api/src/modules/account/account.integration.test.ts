import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  user as userTable,
  organization as organizationTable,
  organizationBilling,
  individualBilling,
  profile as profileTable,
  withOrgScope,
  withSystemScope,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";
import { ensureBillingRow, updateBillingByOrgId } from "../billing/organization-billing.db";

// Hits the real dev database, same pattern as the other integration test files. This
// one is the reason apps/api/src/modules/account/account.service.ts explicitly deletes
// RLS-protected rows itself instead of trusting FK cascade — worth proving directly,
// not just reasoning about, since a mistake here means either data survives a "permanent
// deletion" request or the delete errors out entirely.

const PORT = 8805;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Account Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  await withSystemScope(async (tx) => {
    for (const orgId of cleanupOrgIds) {
      await tx.delete(organizationBilling).where(eq(organizationBilling.organizationId, orgId));
    }
    for (const userId of cleanupUserIds) {
      await tx.delete(profileTable).where(eq(profileTable.userId, userId));
      await tx.delete(individualBilling).where(eq(individualBilling.userId, userId));
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

describe("DELETE /account", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/account`, {
      method: "DELETE",
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("deletes a solo user (no org) permanently", async () => {
    const solo = await signUp(`account-solo-${Date.now()}@example.com`);

    const res = await fetch(`http://localhost:${PORT}/account`, {
      method: "DELETE",
      headers: { Origin: ORIGIN, Cookie: solo.cookie },
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(userTable).where(eq(userTable.id, solo.userId));
    expect(row).toBeUndefined();
  });

  it("deletes the org too when the user is its sole owner and only member, including the org's billing row", async () => {
    const owner = await signUp(`account-solo-owner-${Date.now()}@example.com`);

    const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
      body: JSON.stringify({
        name: "Solo Owner Org",
        slug: `account-solo-owner-org-${Date.now()}`,
      }),
    });
    const org = (await orgRes.json()) as { id: string };

    await withOrgScope(org.id, async (tx) => {
      await ensureBillingRow(tx, org.id);
      await updateBillingByOrgId(tx, org.id, { providerCustomerId: "cus_test_account_delete" });
    });

    const res = await fetch(`http://localhost:${PORT}/account`, {
      method: "DELETE",
      headers: { Origin: ORIGIN, Cookie: owner.cookie },
    });
    expect(res.status).toBe(200);

    const [userRow] = await db.select().from(userTable).where(eq(userTable.id, owner.userId));
    expect(userRow).toBeUndefined();

    const [orgRow] = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, org.id));
    expect(orgRow).toBeUndefined();

    const billingRows = await withSystemScope((tx) =>
      tx.select().from(organizationBilling).where(eq(organizationBilling.organizationId, org.id)),
    );
    expect(billingRows).toEqual([]);
  }, 15000);

  it("blocks deletion when the user is the sole owner of an org that still has other members, and deletes nothing", async () => {
    const owner = await signUp(`account-blocked-owner-${Date.now()}@example.com`);
    const member = await signUp(`account-blocked-member-${Date.now()}@example.com`);

    const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
      body: JSON.stringify({ name: "Blocked Org", slug: `account-blocked-org-${Date.now()}` }),
    });
    const org = (await orgRes.json()) as { id: string };
    cleanupOrgIds.push(org.id);
    cleanupUserIds.push(owner.userId, member.userId);

    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: org.id },
    });

    const res = await fetch(`http://localhost:${PORT}/account`, {
      method: "DELETE",
      headers: { Origin: ORIGIN, Cookie: owner.cookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");

    const [ownerRow] = await db.select().from(userTable).where(eq(userTable.id, owner.userId));
    expect(ownerRow).toBeDefined();
    const [orgRow] = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, org.id));
    expect(orgRow).toBeDefined();
  });

  it("lets a non-owner member delete their own account without touching the org or other members", async () => {
    const owner = await signUp(`account-survivor-owner-${Date.now()}@example.com`);
    const member = await signUp(`account-leaving-member-${Date.now()}@example.com`);

    const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
      body: JSON.stringify({ name: "Survivor Org", slug: `account-survivor-org-${Date.now()}` }),
    });
    const org = (await orgRes.json()) as { id: string };
    cleanupOrgIds.push(org.id);
    cleanupUserIds.push(owner.userId);

    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: org.id },
    });

    const res = await fetch(`http://localhost:${PORT}/account`, {
      method: "DELETE",
      headers: { Origin: ORIGIN, Cookie: member.cookie },
    });
    expect(res.status).toBe(200);

    const [memberRow] = await db.select().from(userTable).where(eq(userTable.id, member.userId));
    expect(memberRow).toBeUndefined();

    const [orgRow] = await db
      .select()
      .from(organizationTable)
      .where(eq(organizationTable.id, org.id));
    expect(orgRow).toBeDefined();
    const [ownerRow] = await db.select().from(userTable).where(eq(userTable.id, owner.userId));
    expect(ownerRow).toBeDefined();
  });
});
