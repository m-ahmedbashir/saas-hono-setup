import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  organization as organizationTable,
  user as userTable,
  organizationBilling as orgBillingTable,
  individualBilling as userBillingTable,
  withOrgScope,
  withUserScope,
  withSystemScope,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";
import { ensureBillingRow, updateBillingByOrgId } from "./organization-billing.db";
import { ensureUserBillingRow, updateUserBillingByUserId } from "./individual-billing.db";

// Covers specs/customer-portal-plan.md's required backend work item 2 — self-service
// billing view + cancel. No real Stripe subscription can be created in this environment
// (CI has no STRIPE_SECRET_KEY, and there's no existing pattern anywhere in this repo for
// provisioning a real test-mode subscription outside Stripe's own hosted Checkout — see
// billing.integration.test.ts's `it.skipIf(!process.env.STRIPE_PRICE_STARTER)` for the
// same constraint on checkout), so the "cancel actually succeeds against Stripe" case
// isn't provable here. What *is* fully provable without any network access: the
// no-subscription-yet short-circuit (a real, common case — most orgs/individuals never
// upgraded), and that a subscription being present routes past that check into a real
// Stripe attempt (proven by seeding a fake id directly and observing the call fails
// differently than the "no subscription" case, not by pretending it succeeded).

const PORT = 8815;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let ownerId: string;
let ownerCookie: string;
let memberId: string;
let memberCookie: string;
let orgId: string;
let soloId: string;
let soloCookie: string;
// A second, wholly unrelated org/owner and a second solo user — exist only to prove
// cross-tenant/cross-user isolation: neither should ever be able to see or affect the
// billing data above, since these routes never accept a client-supplied org/user id.
let outsiderOwnerId: string;
let outsiderOwnerCookie: string;
let outsiderOrgId: string;
let outsiderSoloId: string;
let outsiderSoloCookie: string;

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Billing Self-Service Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

beforeAll(async () => {
  server = serve({ fetch: app.fetch, port: PORT });

  const owner = await signUp(`billing-self-owner-${Date.now()}@example.com`);
  ownerId = owner.userId;
  ownerCookie = owner.cookie;

  const member = await signUp(`billing-self-member-${Date.now()}@example.com`);
  memberId = member.userId;
  memberCookie = member.cookie;

  const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Billing Self-Service Org",
      slug: `billing-self-service-org-${Date.now()}`,
    }),
  });
  const org = (await orgRes.json()) as { id: string };
  orgId = org.id;

  await auth.api.addMember({ body: { userId: memberId, role: "member", organizationId: orgId } });
  // addMember alone doesn't make this org the member's *active* org — without this,
  // injectUserContext resolves them as B2C, and requirePermission's B2C passthrough would
  // let them through before ever checking their role (same note as billing.integration.test.ts).
  await fetch(`http://localhost:${PORT}/api/auth/organization/set-active`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: memberCookie },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const solo = await signUp(`billing-self-solo-${Date.now()}@example.com`);
  soloId = solo.userId;
  soloCookie = solo.cookie;

  const outsiderOwner = await signUp(`billing-self-outsider-owner-${Date.now()}@example.com`);
  outsiderOwnerId = outsiderOwner.userId;
  outsiderOwnerCookie = outsiderOwner.cookie;
  const outsiderOrgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: outsiderOwnerCookie },
    body: JSON.stringify({
      name: "Billing Self-Service Outsider Org",
      slug: `billing-self-service-outsider-org-${Date.now()}`,
    }),
  });
  const outsiderOrg = (await outsiderOrgRes.json()) as { id: string };
  outsiderOrgId = outsiderOrg.id;

  const outsiderSolo = await signUp(`billing-self-outsider-solo-${Date.now()}@example.com`);
  outsiderSoloId = outsiderSolo.userId;
  outsiderSoloCookie = outsiderSolo.cookie;
});

afterAll(async () => {
  await withSystemScope(async (tx) => {
    await tx.delete(orgBillingTable).where(eq(orgBillingTable.organizationId, orgId));
    await tx.delete(orgBillingTable).where(eq(orgBillingTable.organizationId, outsiderOrgId));
    await tx.delete(userBillingTable).where(eq(userBillingTable.userId, ownerId));
    await tx.delete(userBillingTable).where(eq(userBillingTable.userId, soloId));
    await tx.delete(userBillingTable).where(eq(userBillingTable.userId, outsiderSoloId));
  });
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(organizationTable).where(eq(organizationTable.id, outsiderOrgId));
  await db.delete(userTable).where(eq(userTable.id, ownerId));
  await db.delete(userTable).where(eq(userTable.id, memberId));
  await db.delete(userTable).where(eq(userTable.id, soloId));
  await db.delete(userTable).where(eq(userTable.id, outsiderOwnerId));
  await db.delete(userTable).where(eq(userTable.id, outsiderSoloId));
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /billing/organization", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/organization`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("lets any active-org member view it (not just owner/admin), defaulting to the free plan for a never-upgraded org", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/organization`, {
      headers: { Origin: ORIGIN, Cookie: memberCookie },
    });
    const body = (await res.json()) as {
      success: boolean;
      data: { plan: string; subscriptionStatus: string | null; seatQuantity: number | null };
    };
    expect(res.status).toBe(200);
    expect(body.data.plan).toBe("free");
    expect(body.data.subscriptionStatus).toBeNull();
    expect(body.data.seatQuantity).toBeNull();
    // Internal Stripe ids never leave the backend on a self-service view.
    expect(body.data).not.toHaveProperty("providerCustomerId");
    expect(body.data).not.toHaveProperty("providerSubscriptionId");
  });

  it("rejects a request with no active organization", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/organization`, {
      headers: { Origin: ORIGIN, Cookie: soloCookie },
    });
    expect(res.status).toBe(422);
  });

  // The actual isolation guarantee, proven rather than assumed: this route takes no
  // :organizationId param at all — it always resolves the caller's own active org
  // (requireOrgContext(userContext).organizationId) — so there is no request shape that
  // could ask for someone else's org. Proven concretely, not just by code inspection: give
  // orgId a distinguishable state, then confirm a legitimate owner of a *different* org
  // sees their own (default) billing, never orgId's, even though they're a real,
  // authenticated owner — just not of this org.
  it("never returns another organization's billing data, even to a legitimate owner of a different org", async () => {
    await withOrgScope(orgId, (tx) => updateBillingByOrgId(tx, orgId, { plan: "growth" }));

    const res = await fetch(`http://localhost:${PORT}/billing/organization`, {
      headers: { Origin: ORIGIN, Cookie: outsiderOwnerCookie },
    });
    const body = (await res.json()) as { success: boolean; data: { plan: string } };
    expect(res.status).toBe(200);
    expect(body.data.plan).not.toBe("growth");
    expect(body.data.plan).toBe("free");
  });
});

describe("GET /billing/individual", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("lets any signed-in user view their own individual billing, defaulting to the individual free plan", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual`, {
      headers: { Origin: ORIGIN, Cookie: soloCookie },
    });
    const body = (await res.json()) as {
      success: boolean;
      data: { plan: string; subscriptionStatus: string | null };
    };
    expect(res.status).toBe(200);
    expect(body.data.plan).toBe("individual_free");
    expect(body.data.subscriptionStatus).toBeNull();
  });

  it("works for a B2B2C session too (individual billing is a separate concept from the active org's)", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual`, {
      headers: { Origin: ORIGIN, Cookie: ownerCookie },
    });
    expect(res.status).toBe(200);
  });

  // Mirrors the organization test above — this route takes no :userId param, it always
  // resolves the caller's own session (userContext.user.id), so there's no way to ask for
  // anyone else's individual billing. Proven concretely: give soloId a distinguishable
  // state, confirm a *different*, equally real, authenticated account never sees it.
  it("never returns another user's individual billing data, even to a different legitimate account", async () => {
    await withUserScope(soloId, (tx) =>
      updateUserBillingByUserId(tx, soloId, { plan: "individual_pro" }),
    );

    const res = await fetch(`http://localhost:${PORT}/billing/individual`, {
      headers: { Origin: ORIGIN, Cookie: outsiderSoloCookie },
    });
    const body = (await res.json()) as { success: boolean; data: { plan: string } };
    expect(res.status).toBe(200);
    expect(body.data.plan).not.toBe("individual_pro");
    expect(body.data.plan).toBe("individual_free");
  });
});

describe("POST /billing/organization-cancel", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/organization-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a member without billing:manage permission", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/organization-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: memberCookie },
    });
    expect(res.status).toBe(403);
  });

  it("rejects with a clear validation error when the org has no active subscription to cancel", async () => {
    await withOrgScope(orgId, (tx) => ensureBillingRow(tx, orgId));

    const res = await fetch(`http://localhost:${PORT}/billing/organization-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: ownerCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("routes past the no-subscription check once a subscription id exists, attempting a real cancellation", async () => {
    // Seeded directly, not via a real checkout — this repo has no way to provision a
    // real test-mode Stripe subscription outside Checkout's hosted UI (see this file's
    // header comment). A fake id can never cancel successfully; what this proves is that
    // the route didn't take the 422 short-circuit above, which is the part actually under
    // this route's own control.
    await withOrgScope(orgId, (tx) =>
      updateBillingByOrgId(tx, orgId, { providerSubscriptionId: `sub_fake_${Date.now()}` }),
    );

    const res = await fetch(`http://localhost:${PORT}/billing/organization-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: ownerCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).not.toBe(200);
    expect(body.error?.code).not.toBe("VALIDATION_ERROR");
  });

  // Same isolation guarantee as the GET route's test, for the mutating side: cancel only
  // ever acts on the caller's own active org (requireOrgContext's organizationId), never a
  // client-supplied one. Proven by giving orgId a real subscription id, then having a
  // different org's legitimate owner call cancel — their own org has no subscription, so
  // this must fail as "no active subscription" (their own org's true state), and orgId's
  // subscription id must remain completely untouched.
  it("canceling only ever affects the caller's own org, never another org's row", async () => {
    const orgSubscriptionId = `sub_isolation_${Date.now()}`;
    await withOrgScope(orgId, (tx) =>
      updateBillingByOrgId(tx, orgId, { providerSubscriptionId: orgSubscriptionId }),
    );
    await withOrgScope(outsiderOrgId, (tx) => ensureBillingRow(tx, outsiderOrgId));

    const res = await fetch(`http://localhost:${PORT}/billing/organization-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: outsiderOwnerCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");

    const [orgRow] = await withSystemScope((tx) =>
      tx.select().from(orgBillingTable).where(eq(orgBillingTable.organizationId, orgId)),
    );
    expect(orgRow?.providerSubscriptionId).toBe(orgSubscriptionId);
  });
});

describe("POST /billing/individual-cancel", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("rejects with a clear validation error when the user has no active subscription to cancel", async () => {
    await withUserScope(soloId, (tx) => ensureUserBillingRow(tx, soloId));

    const res = await fetch(`http://localhost:${PORT}/billing/individual-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: soloCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("routes past the no-subscription check once a subscription id exists, attempting a real cancellation", async () => {
    await withUserScope(soloId, (tx) =>
      updateUserBillingByUserId(tx, soloId, { providerSubscriptionId: `sub_fake_${Date.now()}` }),
    );

    const res = await fetch(`http://localhost:${PORT}/billing/individual-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: soloCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).not.toBe(200);
    expect(body.error?.code).not.toBe("VALIDATION_ERROR");
  });

  // Mirrors the organization cancel isolation test above — proves a different account's
  // cancel call can never touch soloId's row, only its own (which has no subscription).
  it("canceling only ever affects the caller's own individual billing, never another user's row", async () => {
    const soloSubscriptionId = `sub_isolation_${Date.now()}`;
    await withUserScope(soloId, (tx) =>
      updateUserBillingByUserId(tx, soloId, { providerSubscriptionId: soloSubscriptionId }),
    );
    await withUserScope(outsiderSoloId, (tx) => ensureUserBillingRow(tx, outsiderSoloId));

    const res = await fetch(`http://localhost:${PORT}/billing/individual-cancel`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: outsiderSoloCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");

    const [soloRow] = await withSystemScope((tx) =>
      tx.select().from(userBillingTable).where(eq(userBillingTable.userId, soloId)),
    );
    expect(soloRow?.providerSubscriptionId).toBe(soloSubscriptionId);
  });
});
