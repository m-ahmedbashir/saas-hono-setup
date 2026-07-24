import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  organization as organizationTable,
  user as userTable,
  organizationProfile as organizationProfileTable,
  withOrgScope,
  withSystemScope,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Hits the real dev database, same pattern as the other integration test files. The
// first test below is the reason this feature exists in the shape it does: it proves
// the eager afterCreateOrganization hook actually fired (packages/core/src/auth/index.ts)
// by reading the profile immediately after org creation, with no prior "touch" of it —
// if the hook silently didn't run, this would be the only thing catching that.

const PORT = 8806;
const ORIGIN = "http://localhost:3000";
const ORG_NUMBER_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Org Profile Test" }),
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
  // Sequential, not Promise.all — a single pg client/transaction can only run one query
  // at a time; concurrent queries on the same tx is exactly what pg's own deprecation
  // warning flags.
  await withSystemScope(async (tx) => {
    for (const orgId of cleanupOrgIds) {
      await tx
        .delete(organizationProfileTable)
        .where(eq(organizationProfileTable.organizationId, orgId));
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

describe("GET /organization-profile", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/organization-profile`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a request with no active organization", async () => {
    const solo = await signUp(`org-profile-solo-${Date.now()}@example.com`);
    cleanupUserIds.push(solo.userId);

    const res = await fetch(`http://localhost:${PORT}/organization-profile`, {
      headers: { Origin: ORIGIN, Cookie: solo.cookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("already has a real orgNumber immediately after org creation, with no prior access (proves the eager hook fired)", async () => {
    const owner = await signUp(`org-profile-owner-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Eager Number Org");
    cleanupOrgIds.push(orgId);

    const res = await fetch(`http://localhost:${PORT}/organization-profile`, {
      headers: { Origin: ORIGIN, Cookie: owner.cookie },
    });
    const body = (await res.json()) as { success: boolean; data: { orgNumber: string } };
    expect(res.status).toBe(200);
    expect(body.data.orgNumber).toMatch(ORG_NUMBER_PATTERN);

    const [row] = await withSystemScope((tx) =>
      tx
        .select()
        .from(organizationProfileTable)
        .where(eq(organizationProfileTable.organizationId, orgId)),
    );
    expect(row?.orgNumber).toBe(body.data.orgNumber);
  });

  it("is viewable by a non-owner member, not just the owner", async () => {
    const owner = await signUp(`org-profile-viewer-owner-${Date.now()}@example.com`);
    const member = await signUp(`org-profile-viewer-member-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId, member.userId);
    const orgId = await createOrg(owner.cookie, "Viewer Org");
    cleanupOrgIds.push(orgId);

    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: orgId },
    });
    await fetch(`http://localhost:${PORT}/api/auth/organization/set-active`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: member.cookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    const res = await fetch(`http://localhost:${PORT}/organization-profile`, {
      headers: { Origin: ORIGIN, Cookie: member.cookie },
    });
    expect(res.status).toBe(200);
  }, 15000);
});

describe("PATCH /organization-profile", () => {
  it("rejects a member without organizationProfile:manage permission", async () => {
    const owner = await signUp(`org-profile-patch-owner-${Date.now()}@example.com`);
    const member = await signUp(`org-profile-patch-member-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId, member.userId);
    const orgId = await createOrg(owner.cookie, "Patch Guard Org");
    cleanupOrgIds.push(orgId);

    await auth.api.addMember({
      body: { userId: member.userId, role: "member", organizationId: orgId },
    });
    await fetch(`http://localhost:${PORT}/api/auth/organization/set-active`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: member.cookie },
      body: JSON.stringify({ organizationId: orgId }),
    });

    const res = await fetch(`http://localhost:${PORT}/organization-profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: member.cookie },
      body: JSON.stringify({ industry: "Should not be allowed" }),
    });
    expect(res.status).toBe(403);
  }, 15000);

  it("lets an owner update fields, and ignores an attempt to set orgNumber", async () => {
    const owner = await signUp(`org-profile-updater-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Updatable Org");
    cleanupOrgIds.push(orgId);

    const beforeRes = await fetch(`http://localhost:${PORT}/organization-profile`, {
      headers: { Origin: ORIGIN, Cookie: owner.cookie },
    });
    const beforeBody = (await beforeRes.json()) as { data: { orgNumber: string } };
    const originalOrgNumber = beforeBody.data.orgNumber;

    const res = await fetch(`http://localhost:${PORT}/organization-profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
      body: JSON.stringify({
        industry: "Software",
        website: "https://example.com",
        address: { city: "Metropolis", country: "US" },
        orgNumber: "HACKED00",
      }),
    });
    const body = (await res.json()) as {
      success: boolean;
      data: { orgNumber: string; industry: string; website: string; address: { city: string } };
    };
    expect(res.status).toBe(200);
    expect(body.data.industry).toBe("Software");
    expect(body.data.website).toBe("https://example.com");
    expect(body.data.address.city).toBe("Metropolis");
    // orgNumber is not in the schema at all, so Zod strips it silently — the response
    // still reflects the real, unchanged, hook-generated number.
    expect(body.data.orgNumber).toBe(originalOrgNumber);
    expect(body.data.orgNumber).not.toBe("HACKED00");
  }, 15000);
});

describe("Row-Level Security on the organization_profile table", () => {
  it("hides the row from an unscoped query, and from a different org's scope", async () => {
    const owner = await signUp(`org-profile-rls-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "RLS Proof Org");
    cleanupOrgIds.push(orgId);

    // Ensures the row exists without relying on the eager hook having already run for
    // this specific test's ordering — matches the self-contained pattern used elsewhere.
    await withOrgScope(orgId, (tx) =>
      tx
        .select()
        .from(organizationProfileTable)
        .where(eq(organizationProfileTable.organizationId, orgId)),
    );

    const unscoped = await db
      .select()
      .from(organizationProfileTable)
      .where(eq(organizationProfileTable.organizationId, orgId));
    expect(unscoped).toEqual([]);

    const wrongOrgScope = await withOrgScope("some-other-org-id", (tx) =>
      tx
        .select()
        .from(organizationProfileTable)
        .where(eq(organizationProfileTable.organizationId, orgId)),
    );
    expect(wrongOrgScope).toEqual([]);

    const rightOrgScope = await withOrgScope(orgId, (tx) =>
      tx
        .select()
        .from(organizationProfileTable)
        .where(eq(organizationProfileTable.organizationId, orgId)),
    );
    expect(rightOrgScope).toHaveLength(1);
  });
});
