import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  and,
  organization as organizationTable,
  member,
  user as userTable,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Proves GET /platform-organizations is genuinely platform-wide (not scoped to the
// caller's own memberships like Better Auth's own /organization/list) and genuinely
// gated on user.role (the platform tier), not member.role — the two things this new
// module/middleware exist for. See specs/platform-organizations.md.

const PORT = 8809;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Platform Org Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

async function signIn(email: string, password: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-in did not return a session cookie");
  return { cookie: setCookie.split(";")[0]! };
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

async function createPlatformAccount(role: "admin" | "support", labelPrefix: string) {
  const email = `${labelPrefix}-${Date.now()}@example.com`;
  const password = "password1234";
  const created = await auth.api.createUser({
    body: { email, password, name: `Platform ${role}`, role },
  });
  const signedIn = await signIn(email, password);
  return { userId: created.user.id, cookie: signedIn.cookie };
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  for (const orgId of cleanupOrgIds) {
    await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  }
  for (const userId of cleanupUserIds) {
    await db.delete(userTable).where(eq(userTable.id, userId));
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /platform-organizations", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a regular user with no platform role", async () => {
    const regular = await signUp(`platform-org-regular-${Date.now()}@example.com`);
    cleanupUserIds.push(regular.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      headers: { Origin: ORIGIN, Cookie: regular.cookie },
    });
    expect(res.status).toBe(403);
  });

  it('lets a user.role:"admin" account list an organization it is NOT a member of, with the correct owner email and member count', async () => {
    const ownerEmail = `platform-org-owner-${Date.now()}@example.com`;
    const owner = await signUp(ownerEmail);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Not My Org");
    cleanupOrgIds.push(orgId);

    const adminEmail = `platform-org-admin-${Date.now()}@example.com`;
    const adminPassword = "password1234";
    const created = await auth.api.createUser({
      body: { email: adminEmail, password: adminPassword, name: "Platform Admin", role: "admin" },
    });
    cleanupUserIds.push(created.user.id);
    const admin = await signIn(adminEmail, adminPassword);

    const res = await fetch(`http://localhost:${PORT}/platform-organizations?limit=100`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      success: boolean;
      data: {
        total: number;
        organizations: {
          id: string;
          name: string;
          ownerName: string | null;
          ownerEmail: string | null;
          ownerEmailVerified: boolean | null;
          ownerBanned: boolean | null;
          memberCount: number;
          seatQuantity: number | null;
          phone: string | null;
          taxId: string | null;
        }[];
      };
    };
    const found = body.data.organizations.find((o) => o.id === orgId);
    expect(found).toBeDefined();
    expect(found?.ownerName).toBe("Platform Org Test");
    expect(found?.ownerEmail).toBe(ownerEmail);
    expect(found?.memberCount).toBe(1);
    // signUp never verifies the email and no ban/billing/profile action ever ran for
    // this org — proves these new fields reflect real state, not stale defaults.
    expect(found?.ownerEmailVerified).toBe(false);
    expect(found?.ownerBanned).toBe(false);
    expect(found?.seatQuantity).toBeNull();
    expect(found?.phone).toBeNull();
    expect(found?.taxId).toBeNull();
  }, 20000);

  it("filters by organization name via the search param, case-insensitively, without matching an unrelated org", async () => {
    const admin = await createPlatformAccount("admin", "platform-org-search-admin");
    cleanupUserIds.push(admin.userId);

    const owner = await signUp(`platform-org-search-owner-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const uniqueMarker = `Zephyrine${Date.now()}`;
    const matchingOrgId = await createOrg(owner.cookie, `${uniqueMarker} Corp`);
    cleanupOrgIds.push(matchingOrgId);
    const unrelatedOrgId = await createOrg(owner.cookie, "Totally Different Co");
    cleanupOrgIds.push(unrelatedOrgId);

    const res = await fetch(
      `http://localhost:${PORT}/platform-organizations?search=${uniqueMarker.toLowerCase()}`,
      { headers: { Origin: ORIGIN, Cookie: admin.cookie } },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { organizations: { id: string }[]; total: number };
    };
    expect(body.data.organizations.some((o) => o.id === matchingOrgId)).toBe(true);
    expect(body.data.organizations.some((o) => o.id === unrelatedOrgId)).toBe(false);
    expect(body.data.total).toBe(1);
  }, 20000);

  it('lets a user.role:"support" account list organizations too (read-only tier)', async () => {
    const supportEmail = `platform-org-support-${Date.now()}@example.com`;
    const supportPassword = "password1234";
    const created = await auth.api.createUser({
      body: {
        email: supportEmail,
        password: supportPassword,
        name: "Platform Support",
        role: "support",
      },
    });
    cleanupUserIds.push(created.user.id);
    const support = await signIn(supportEmail, supportPassword);

    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      headers: { Origin: ORIGIN, Cookie: support.cookie },
    });
    expect(res.status).toBe(200);
  });
});

describe("POST /platform-organizations", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({
        organizationName: "Should Not Exist",
        organizationSlug: `should-not-exist-${Date.now()}`,
        ownerName: "Nobody",
        ownerEmail: `platform-org-create-unauth-${Date.now()}@example.com`,
        ownerPassword: "password1234",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a regular user with no platform role", async () => {
    const regular = await signUp(`platform-org-create-regular-${Date.now()}@example.com`);
    cleanupUserIds.push(regular.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: regular.cookie },
      body: JSON.stringify({
        organizationName: "Should Not Exist",
        organizationSlug: `should-not-exist-${Date.now()}`,
        ownerName: "Nobody",
        ownerEmail: `platform-org-create-regular-owner-${Date.now()}@example.com`,
        ownerPassword: "password1234",
      }),
    });
    expect(res.status).toBe(403);
  });

  // create is admin-only, deliberately withheld from support (same read-only-tier
  // reasoning as the `user` resource's create/set-role/ban).
  it('rejects a user.role:"support" account (create is admin-only)', async () => {
    const support = await createPlatformAccount("support", "platform-org-create-support");
    cleanupUserIds.push(support.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: support.cookie },
      body: JSON.stringify({
        organizationName: "Should Not Exist",
        organizationSlug: `should-not-exist-${Date.now()}`,
        ownerName: "Nobody",
        ownerEmail: `platform-org-create-support-owner-${Date.now()}@example.com`,
        ownerPassword: "password1234",
      }),
    });
    expect(res.status).toBe(403);
  }, 15000);

  it('lets a user.role:"admin" account provision a brand-new owner account + organization, with the owner correctly set as "owner" (not just a member)', async () => {
    const admin = await createPlatformAccount("admin", "platform-org-create-admin");
    cleanupUserIds.push(admin.userId);

    const ownerEmail = `platform-org-create-owner-${Date.now()}@example.com`;
    const orgSlug = `provisioned-org-${Date.now()}`;

    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: admin.cookie },
      body: JSON.stringify({
        organizationName: "Provisioned Org",
        organizationSlug: orgSlug,
        ownerName: "New Customer Owner",
        ownerEmail,
        ownerPassword: "password1234",
      }),
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as {
      success: boolean;
      data: { organizationId: string; ownerUserId: string };
    };
    cleanupOrgIds.push(body.data.organizationId);
    cleanupUserIds.push(body.data.ownerUserId);

    // The new owner account must actually be able to sign in with the password the
    // admin set — proves a real, usable credential account was created, not just a
    // bare user row.
    const ownerSignIn = await signIn(ownerEmail, "password1234");
    expect(ownerSignIn.cookie).toBeTruthy();

    const [memberRow] = await db
      .select()
      .from(member)
      .where(
        and(
          eq(member.organizationId, body.data.organizationId),
          eq(member.userId, body.data.ownerUserId),
        ),
      );
    expect(memberRow?.role).toBe("owner");
  }, 20000);

  it("rejects a duplicate organization slug without creating a dangling owner account", async () => {
    const admin = await createPlatformAccount("admin", "platform-org-create-dupslug-admin");
    cleanupUserIds.push(admin.userId);

    const existingOwner = await signUp(
      `platform-org-create-dupslug-existing-${Date.now()}@example.com`,
    );
    cleanupUserIds.push(existingOwner.userId);
    const takenSlug = `taken-slug-${Date.now()}`;
    // createOrg derives its own slug internally, so create the colliding org directly
    // with a slug we control instead.
    const takenRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: existingOwner.cookie },
      body: JSON.stringify({ name: "Taken Slug Org", slug: takenSlug }),
    });
    const takenOrg = (await takenRes.json()) as { id: string };
    cleanupOrgIds.push(takenOrg.id);

    const clashingEmail = `platform-org-create-dupslug-owner-${Date.now()}@example.com`;
    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: admin.cookie },
      body: JSON.stringify({
        organizationName: "Duplicate Slug Org",
        organizationSlug: takenSlug,
        ownerName: "Should Not Be Created",
        ownerEmail: clashingEmail,
        ownerPassword: "password1234",
      }),
    });
    expect(res.status).toBe(422);

    const [danglingUser] = await db
      .select()
      .from(userTable)
      .where(eq(userTable.email, clashingEmail));
    expect(danglingUser).toBeUndefined();
  }, 20000);

  it("rejects a duplicate owner email with a clean error", async () => {
    const admin = await createPlatformAccount("admin", "platform-org-create-dupemail-admin");
    cleanupUserIds.push(admin.userId);

    const existingEmail = `platform-org-create-dupemail-existing-${Date.now()}@example.com`;
    const existingUser = await signUp(existingEmail);
    cleanupUserIds.push(existingUser.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-organizations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: admin.cookie },
      body: JSON.stringify({
        organizationName: "Dup Email Org",
        organizationSlug: `dup-email-org-${Date.now()}`,
        ownerName: "Someone",
        ownerEmail: existingEmail,
        ownerPassword: "password1234",
      }),
    });
    expect(res.status).toBe(422);
  }, 20000);
});
