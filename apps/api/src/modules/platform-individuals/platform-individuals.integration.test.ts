import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  withSystemScope,
  organization as organizationTable,
  user as userTable,
  profile as profileTable,
  individualBilling as individualBillingTable,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Proves GET /platform-individuals is genuinely the complement of the Users (staff)
// page — every non-staff account, including B2B2C org members shown with their org
// memberships for context — and that a staff account is fully partitioned out (404 on
// detail, absent from the list), not just hidden. See specs/platform-individuals.md.

const PORT = 8810;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

async function signUp(email: string, name = "Platform Individual Test") {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name }),
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

// Seeds profile/individual_billing directly (withSystemScope) rather than exercising
// PATCH /profile or a real Stripe checkout — those flows have their own tests; this
// file is only about the platform-individuals view over whatever data already exists.
async function seedProfileAndBilling(userId: string, phone: string, plan: string) {
  await withSystemScope(async (tx) => {
    await tx.insert(profileTable).values({ id: crypto.randomUUID(), userId, phone });
    await tx.insert(individualBillingTable).values({
      id: crypto.randomUUID(),
      userId,
      plan,
      subscriptionStatus: "active",
    });
  });
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  for (const orgId of cleanupOrgIds) {
    await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  }
  await withSystemScope(async (tx) => {
    for (const userId of cleanupUserIds) {
      await tx.delete(profileTable).where(eq(profileTable.userId, userId));
      await tx.delete(individualBillingTable).where(eq(individualBillingTable.userId, userId));
    }
  });
  for (const userId of cleanupUserIds) {
    await db.delete(userTable).where(eq(userTable.id, userId));
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /platform-individuals", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/platform-individuals`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a regular user with no platform role", async () => {
    const regular = await signUp(`platform-ind-regular-${Date.now()}@example.com`);
    cleanupUserIds.push(regular.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-individuals`, {
      headers: { Origin: ORIGIN, Cookie: regular.cookie },
    });
    expect(res.status).toBe(403);
  });

  it('lets a user.role:"admin" account list a regular account, with its profile/billing joined and no staff accounts present', async () => {
    const admin = await createPlatformAccount("admin", "platform-ind-admin");
    cleanupUserIds.push(admin.userId);

    const targetEmail = `platform-ind-target-${Date.now()}@example.com`;
    const target = await signUp(targetEmail, "Target Individual");
    cleanupUserIds.push(target.userId);
    await seedProfileAndBilling(target.userId, "+15551234567", "individual_pro");

    const res = await fetch(`http://localhost:${PORT}/platform-individuals?limit=100`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        total: number;
        individuals: {
          id: string;
          email: string;
          phone: string | null;
          plan: string | null;
          subscriptionStatus: string | null;
          organizations: { id: string; name: string; role: string }[];
        }[];
      };
    };

    const found = body.data.individuals.find((i) => i.id === target.userId);
    expect(found).toBeDefined();
    expect(found?.email).toBe(targetEmail);
    expect(found?.phone).toBe("+15551234567");
    expect(found?.plan).toBe("individual_pro");
    expect(found?.subscriptionStatus).toBe("active");
    expect(found?.organizations).toEqual([]);

    // The admin account itself must never appear — staff are excluded, not merely
    // deprioritized.
    expect(body.data.individuals.some((i) => i.id === admin.userId)).toBe(false);
  }, 20000);

  it('lets a user.role:"support" account list individuals too (read-only tier, same as staff listing)', async () => {
    const support = await createPlatformAccount("support", "platform-ind-support");
    cleanupUserIds.push(support.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-individuals`, {
      headers: { Origin: ORIGIN, Cookie: support.cookie },
    });
    expect(res.status).toBe(200);
  }, 15000);

  it("filters by name or email via the search param, case-insensitively", async () => {
    const admin = await createPlatformAccount("admin", "platform-ind-search-admin");
    cleanupUserIds.push(admin.userId);

    const uniqueMarker = `Zephyrine${Date.now()}`;
    const target = await signUp(`platform-ind-search-${Date.now()}@example.com`, uniqueMarker);
    cleanupUserIds.push(target.userId);

    const res = await fetch(
      `http://localhost:${PORT}/platform-individuals?search=${uniqueMarker.toLowerCase()}`,
      { headers: { Origin: ORIGIN, Cookie: admin.cookie } },
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: { individuals: { id: string }[]; total: number } };
    expect(body.data.individuals.some((i) => i.id === target.userId)).toBe(true);
    expect(body.data.total).toBe(1);
  }, 20000);

  it("shows every organization a person belongs to, not just the first (member has no unique-per-user constraint)", async () => {
    const admin = await createPlatformAccount("admin", "platform-ind-multiorg-admin");
    cleanupUserIds.push(admin.userId);

    const member = await signUp(`platform-ind-multiorg-member-${Date.now()}@example.com`);
    cleanupUserIds.push(member.userId);

    const firstOrgId = await createOrg(member.cookie, "First Org");
    cleanupOrgIds.push(firstOrgId);

    const secondOwner = await signUp(`platform-ind-multiorg-owner2-${Date.now()}@example.com`);
    cleanupUserIds.push(secondOwner.userId);
    const secondOrgId = await createOrg(secondOwner.cookie, "Second Org");
    cleanupOrgIds.push(secondOrgId);
    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: secondOrgId },
    });

    const res = await fetch(`http://localhost:${PORT}/platform-individuals/${member.userId}`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { organizations: { id: string; role: string }[] };
    };
    expect(body.data.organizations).toHaveLength(2);
    expect(body.data.organizations.some((o) => o.id === firstOrgId && o.role === "owner")).toBe(
      true,
    );
    expect(body.data.organizations.some((o) => o.id === secondOrgId && o.role === "member")).toBe(
      true,
    );
  }, 25000);
});

describe("GET /platform-individuals/:userId", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/platform-individuals/some-id`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for a nonexistent user id", async () => {
    const admin = await createPlatformAccount("admin", "platform-ind-detail-404-admin");
    cleanupUserIds.push(admin.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-individuals/does-not-exist`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  }, 15000);

  it("returns 404 for a staff account id — partitioned, not merely hidden from the list", async () => {
    const admin = await createPlatformAccount("admin", "platform-ind-detail-staff-admin");
    cleanupUserIds.push(admin.userId);

    const support = await createPlatformAccount("support", "platform-ind-detail-staff-support");
    cleanupUserIds.push(support.userId);

    const res = await fetch(`http://localhost:${PORT}/platform-individuals/${support.userId}`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(404);
  }, 20000);

  it("returns the full profile and billing detail for a regular account", async () => {
    const admin = await createPlatformAccount("admin", "platform-ind-detail-full-admin");
    cleanupUserIds.push(admin.userId);

    const target = await signUp(
      `platform-ind-detail-full-${Date.now()}@example.com`,
      "Detail Target",
    );
    cleanupUserIds.push(target.userId);
    await seedProfileAndBilling(target.userId, "+15559876543", "individual_free");

    const res = await fetch(`http://localhost:${PORT}/platform-individuals/${target.userId}`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: {
        id: string;
        name: string;
        phone: string | null;
        plan: string | null;
        subscriptionStatus: string | null;
        organizations: unknown[];
      };
    };
    expect(body.data.id).toBe(target.userId);
    expect(body.data.name).toBe("Detail Target");
    expect(body.data.phone).toBe("+15559876543");
    expect(body.data.plan).toBe("individual_free");
    expect(body.data.subscriptionStatus).toBe("active");
    expect(body.data.organizations).toEqual([]);
  }, 20000);
});
