import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  and,
  isNull,
  inArray,
  organization as organizationTable,
  user as userTable,
  subscriptionPlans as subscriptionPlansTable,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Proves the six payment-correctness mechanisms in
// specs/subscription-management-plan.md's "Closing the payment-correctness gaps" are
// real, not just documented — plus ordinary CRUD/permission-tier coverage, same shape
// as platform-organizations/platform-individuals' own integration tests.

const PORT = 8811;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];
const cleanupPlanIds: string[] = [];

const denyMostFeatures = {
  priority_support: false,
  advanced_analytics: false,
  api_access: false,
  custom_branding: false,
};
const zeroLimits = { maxProjects: 0, maxApiRequestsPerMonth: 0 };

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Subscription Plans Test" }),
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

function planBody(overrides: Record<string, unknown> = {}) {
  return {
    ownerType: "organization",
    planId: `test-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: "Test Plan",
    features: denyMostFeatures,
    limits: zeroLimits,
    ...overrides,
  };
}

async function createPlanAs(cookie: string, body: Record<string, unknown>) {
  return fetch(`http://localhost:${PORT}/subscription-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify(body),
  });
}

async function updatePlanAs(cookie: string, id: string, body: Record<string, unknown>) {
  return fetch(`http://localhost:${PORT}/subscription-plans/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie },
    body: JSON.stringify(body),
  });
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  if (cleanupPlanIds.length > 0) {
    await db
      .delete(subscriptionPlansTable)
      .where(inArray(subscriptionPlansTable.id, cleanupPlanIds));
  }
  for (const orgId of cleanupOrgIds) {
    await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  }
  for (const userId of cleanupUserIds) {
    await db.delete(userTable).where(eq(userTable.id, userId));
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /subscription-plans", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/subscription-plans`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a regular user with no platform role", async () => {
    const regular = await signUp(`sub-plans-regular-${Date.now()}@example.com`);
    cleanupUserIds.push(regular.userId);

    const res = await fetch(`http://localhost:${PORT}/subscription-plans`, {
      headers: { Origin: ORIGIN, Cookie: regular.cookie },
    });
    expect(res.status).toBe(403);
  });

  it("lets both admin and support list plans (read-only tier for support)", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-list-admin");
    cleanupUserIds.push(admin.userId);
    const support = await createPlatformAccount("support", "sub-plans-list-support");
    cleanupUserIds.push(support.userId);

    const adminRes = await fetch(
      `http://localhost:${PORT}/subscription-plans?ownerType=organization`,
      {
        headers: { Origin: ORIGIN, Cookie: admin.cookie },
      },
    );
    expect(adminRes.status).toBe(200);
    const adminBody = (await adminRes.json()) as { data: { plans: { planId: string }[] } };
    expect(adminBody.data.plans.some((p) => p.planId === "free")).toBe(true);

    const supportRes = await fetch(
      `http://localhost:${PORT}/subscription-plans?ownerType=organization`,
      {
        headers: { Origin: ORIGIN, Cookie: support.cookie },
      },
    );
    expect(supportRes.status).toBe(200);
  }, 20000);
});

describe("POST /subscription-plans", () => {
  it("rejects a regular user", async () => {
    const regular = await signUp(`sub-plans-create-regular-${Date.now()}@example.com`);
    cleanupUserIds.push(regular.userId);

    const res = await createPlanAs(regular.cookie, planBody());
    expect(res.status).toBe(403);
  });

  it("rejects a support account — create is manage-only, not list", async () => {
    const support = await createPlatformAccount("support", "sub-plans-create-support");
    cleanupUserIds.push(support.userId);

    const res = await createPlanAs(support.cookie, planBody());
    expect(res.status).toBe(403);
  });

  it("lets an admin create a shared plan with the full known feature/limit set", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-create-admin");
    cleanupUserIds.push(admin.userId);

    const res = await createPlanAs(
      admin.cookie,
      planBody({ name: "Admin Created Plan", seatLimit: 25 }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { id: string; isActive: boolean; isDefault: boolean };
    };
    cleanupPlanIds.push(body.data.id);
    expect(body.data.isActive).toBe(true);
    expect(body.data.isDefault).toBe(false);
  }, 15000);

  it("rejects an unknown feature/limit key at the write boundary", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-badkey-admin");
    cleanupUserIds.push(admin.userId);

    const res = await createPlanAs(
      admin.cookie,
      planBody({ features: { ...denyMostFeatures, made_up_feature: true } }),
    );
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  }, 15000);

  it.skipIf(!process.env.STRIPE_SECRET_KEY)(
    "rejects a providerPriceId that doesn't exist in Stripe — item 1, caught at save time not checkout time",
    async () => {
      const admin = await createPlatformAccount("admin", "sub-plans-badprice-admin");
      cleanupUserIds.push(admin.userId);

      const res = await createPlanAs(
        admin.cookie,
        planBody({ providerPriceId: "price_definitely_not_real_12345" }),
      );
      const body = (await res.json()) as { success: boolean; error?: { code: string } };
      expect(res.status).toBe(422);
      expect(body.error?.code).toBe("VALIDATION_ERROR");
    },
    15000,
  );

  it("lets two different organizations each create a custom plan with the same planId slug, proving the corrected unique index", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-slug-admin");
    cleanupUserIds.push(admin.userId);

    const owner1 = await signUp(`sub-plans-slug-owner1-${Date.now()}@example.com`);
    cleanupUserIds.push(owner1.userId);
    const org1 = await createOrg(owner1.cookie, "Slug Test Org One");
    cleanupOrgIds.push(org1);

    const owner2 = await signUp(`sub-plans-slug-owner2-${Date.now()}@example.com`);
    cleanupUserIds.push(owner2.userId);
    const org2 = await createOrg(owner2.cookie, "Slug Test Org Two");
    cleanupOrgIds.push(org2);

    const sharedSlug = `enterprise-${Date.now()}`;

    const res1 = await createPlanAs(
      admin.cookie,
      planBody({ planId: sharedSlug, organizationId: org1, name: "Org One Enterprise" }),
    );
    expect(res1.status).toBe(200);
    const body1 = (await res1.json()) as { data: { id: string } };
    cleanupPlanIds.push(body1.data.id);

    const res2 = await createPlanAs(
      admin.cookie,
      planBody({ planId: sharedSlug, organizationId: org2, name: "Org Two Enterprise" }),
    );
    expect(res2.status).toBe(200);
    const body2 = (await res2.json()) as { data: { id: string } };
    cleanupPlanIds.push(body2.data.id);

    expect(body1.data.id).not.toBe(body2.data.id);
  }, 25000);

  it("rejects a duplicate shared planId for the same ownerType", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-dup-admin");
    cleanupUserIds.push(admin.userId);

    const slug = `dup-slug-${Date.now()}`;
    const first = await createPlanAs(admin.cookie, planBody({ planId: slug }));
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { data: { id: string } };
    cleanupPlanIds.push(firstBody.data.id);

    const second = await createPlanAs(admin.cookie, planBody({ planId: slug }));
    const secondBody = (await second.json()) as { success: boolean; error?: { code: string } };
    expect(second.status).toBe(422);
    expect(secondBody.error?.code).toBe("VALIDATION_ERROR");
  }, 15000);

  it("rejects marking a custom (org-scoped) plan as the default", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-customdefault-admin");
    cleanupUserIds.push(admin.userId);

    const owner = await signUp(`sub-plans-customdefault-owner-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Custom Default Test Org");
    cleanupOrgIds.push(orgId);

    const res = await createPlanAs(
      admin.cookie,
      planBody({ organizationId: orgId, isDefault: true }),
    );
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  }, 20000);
});

// Not separately tested here: deactivating the *last* active shared plan while it is
// NOT currently the default (the other trigger for item 6's guard, distinct from
// "deactivating the current default" below). The seeded catalog always keeps a
// permanent active default ("free"/"individual_free"), so reaching that state
// deterministically would require temporarily deactivating every other real shared
// plan for an ownerType (starter/growth) — a materially bigger, riskier mutation of
// shared seed data than the default-reassignment test below already accepts, and one
// that could race with billing.integration.test.ts's real-Stripe-checkout tests, which
// depend on "starter" staying active for the duration of a test run. Covered instead by
// direct inspection of subscription-plans.service.ts's `updatePlan`: the "last active
// plan" check (`others.length === 0`) is unconditional on `isDefault` — it runs
// identically regardless of whether the plan being deactivated happens to be the
// default, which is exactly why the guard needed splitting into two conditions in the
// first place (see the spec's item 6 and the vacuous-truth note there).
describe("PATCH /subscription-plans/:id", () => {
  it("rejects a support account — update is manage-only", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-patchperm-admin");
    cleanupUserIds.push(admin.userId);
    const support = await createPlatformAccount("support", "sub-plans-patchperm-support");
    cleanupUserIds.push(support.userId);

    const created = await createPlanAs(admin.cookie, planBody());
    const createdBody = (await created.json()) as { data: { id: string } };
    cleanupPlanIds.push(createdBody.data.id);

    const res = await updatePlanAs(support.cookie, createdBody.data.id, {
      name: "Should Not Apply",
      features: denyMostFeatures,
      limits: zeroLimits,
      isActive: true,
      isDefault: false,
    });
    expect(res.status).toBe(403);
  }, 15000);

  it("lets an admin edit an existing plan's name/limits", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-edit-admin");
    cleanupUserIds.push(admin.userId);

    const created = await createPlanAs(admin.cookie, planBody({ name: "Before Edit" }));
    const createdBody = (await created.json()) as { data: { id: string } };
    cleanupPlanIds.push(createdBody.data.id);

    const res = await updatePlanAs(admin.cookie, createdBody.data.id, {
      name: "After Edit",
      features: { ...denyMostFeatures, api_access: true },
      limits: { maxProjects: 5, maxApiRequestsPerMonth: 500 },
      isActive: true,
      isDefault: false,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { name: string; limits: { maxProjects: number } } };
    expect(body.data.name).toBe("After Edit");
    expect(body.data.limits.maxProjects).toBe(5);
  }, 15000);

  it("returns an accurate activeSubscriberCount on GET /:id", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-count-admin");
    cleanupUserIds.push(admin.userId);

    const created = await createPlanAs(admin.cookie, planBody());
    const createdBody = (await created.json()) as { data: { id: string; planId: string } };
    cleanupPlanIds.push(createdBody.data.id);

    const res = await fetch(`http://localhost:${PORT}/subscription-plans/${createdBody.data.id}`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { activeSubscriberCount: number } };
    // No org has actually subscribed to this brand-new test plan yet.
    expect(body.data.activeSubscriberCount).toBe(0);
  }, 15000);

  it("blocks deactivating the current default plan for an ownerType", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-deactdefault-admin");
    cleanupUserIds.push(admin.userId);

    const [freeRow] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(
        and(
          eq(subscriptionPlansTable.ownerType, "organization"),
          eq(subscriptionPlansTable.planId, "free"),
          isNull(subscriptionPlansTable.organizationId),
        ),
      );
    expect(freeRow?.isDefault).toBe(true);

    // Deliberately never persisted — the whole point is this request must be rejected
    // before anything changes, so there's nothing to restore afterward.
    const res = await updatePlanAs(admin.cookie, freeRow!.id, {
      name: freeRow!.name,
      description: freeRow!.description ?? undefined,
      seatLimit: freeRow!.seatLimit ?? undefined,
      providerPriceId: freeRow!.providerPriceId ?? undefined,
      features: freeRow!.features,
      limits: freeRow!.limits,
      isActive: false,
      isDefault: freeRow!.isDefault,
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");

    const [freeRowAfter] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, freeRow!.id));
    expect(freeRowAfter?.isActive).toBe(true);
    expect(freeRowAfter?.isDefault).toBe(true);
  }, 15000);

  // Reassigning the default plan necessarily touches the real seeded "free" plan's
  // isDefault flag for organizations (the invariant is global per ownerType, not
  // scoped to a test fixture) — there is no way to prove reassignment works without
  // this. Kept as safe as practical: both temporary plans mirror "free"'s own
  // deny-most shape, so even a concurrently-running test that happens to resolve
  // entitlements against one mid-run sees the same deny-all behavior "free" itself
  // has, and the real default is restored immediately in a `finally`, not deferred to
  // `afterAll`, to keep the window as small as possible.
  it("reassigning isDefault to a new plan clears the previous one, never leaving two defaults", async () => {
    const admin = await createPlatformAccount("admin", "sub-plans-reassign-admin");
    cleanupUserIds.push(admin.userId);

    const [freeRow] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(
        and(
          eq(subscriptionPlansTable.ownerType, "organization"),
          eq(subscriptionPlansTable.planId, "free"),
          isNull(subscriptionPlansTable.organizationId),
        ),
      );
    expect(freeRow?.isDefault).toBe(true);

    const createdA = await createPlanAs(admin.cookie, planBody({ name: "Temp Default A" }));
    const planA = (await createdA.json()) as { data: { id: string } };
    cleanupPlanIds.push(planA.data.id);

    const createdB = await createPlanAs(admin.cookie, planBody({ name: "Temp Default B" }));
    const planB = (await createdB.json()) as { data: { id: string } };
    cleanupPlanIds.push(planB.data.id);

    try {
      const setA = await updatePlanAs(admin.cookie, planA.data.id, {
        name: "Temp Default A",
        features: denyMostFeatures,
        limits: zeroLimits,
        isActive: true,
        isDefault: true,
      });
      expect(setA.status).toBe(200);

      const [freeAfterA] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, freeRow!.id));
      expect(freeAfterA?.isDefault).toBe(false);

      const setB = await updatePlanAs(admin.cookie, planB.data.id, {
        name: "Temp Default B",
        features: denyMostFeatures,
        limits: zeroLimits,
        isActive: true,
        isDefault: true,
      });
      expect(setB.status).toBe(200);

      const [planAAfter] = await db
        .select()
        .from(subscriptionPlansTable)
        .where(eq(subscriptionPlansTable.id, planA.data.id));
      expect(planAAfter?.isDefault).toBe(false);

      const defaultRows = await db
        .select()
        .from(subscriptionPlansTable)
        .where(
          and(
            eq(subscriptionPlansTable.ownerType, "organization"),
            isNull(subscriptionPlansTable.organizationId),
            eq(subscriptionPlansTable.isDefault, true),
          ),
        );
      expect(defaultRows).toHaveLength(1);
      expect(defaultRows[0]?.id).toBe(planB.data.id);
    } finally {
      await updatePlanAs(admin.cookie, freeRow!.id, {
        name: freeRow!.name,
        description: freeRow!.description ?? undefined,
        seatLimit: freeRow!.seatLimit ?? undefined,
        providerPriceId: freeRow!.providerPriceId ?? undefined,
        features: freeRow!.features,
        limits: freeRow!.limits,
        isActive: true,
        isDefault: true,
      });
    }
  }, 30000);
});
