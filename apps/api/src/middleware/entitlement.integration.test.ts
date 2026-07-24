import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
  db,
  eq,
  organization as organizationTable,
  user as userTable,
  organizationBilling,
  individualBilling,
  withOrgScope,
  withUserScope,
  withSystemScope,
} from "@repo/db";
import { AppError } from "@repo/core";
import { authRoutes } from "../modules/auth/auth.routes";
import { success, failure } from "../lib/response";
import { injectUserContext } from "./auth.middleware";
import { requireFeature } from "./entitlement.middleware";
import { ensureBillingRow, updateBillingByOrgId } from "../modules/billing/organization-billing.db";
import {
  ensureUserBillingRow,
  updateUserBillingByUserId,
} from "../modules/billing/individual-billing.db";

// No permanent route in the app uses requireFeature yet (nothing in this repo needs
// gating today — see AGENTS.md's "don't scaffold ahead of the task"), so this test
// mounts a tiny standalone app that wires the real injectUserContext/requireFeature
// middleware onto two test-only routes, same spirit as response.test.ts's standalone
// Hono instance but with a real server/session/DB since requireFeature needs both.

const PORT = 8803;
const ORIGIN = "http://localhost:3000";

function okHandler(c: Context) {
  return success(c, { ok: true });
}

const testApp = new Hono()
  .route("/api/auth", authRoutes)
  .get(
    "/test/org-feature",
    injectUserContext,
    requireFeature("advanced_analytics", "organization"),
    okHandler,
  )
  .get(
    "/test/individual-feature",
    injectUserContext,
    requireFeature("priority_support", "individual"),
    okHandler,
  );

// Mirrors app.ts's AppError→envelope translation — the real app.onError does more
// (Sentry, HTTPException handling), none of which this test needs.
testApp.onError((err, c) => {
  if (err instanceof AppError) {
    return failure(c, err.code, err.message, err.status as ContentfulStatusCode, err.details);
  }
  throw err;
});

let server: ServerType;
let ownerId: string;
let ownerCookie: string;
let soloId: string;
let soloCookie: string;
let orgId: string;

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Entitlement Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

beforeAll(async () => {
  server = serve({ fetch: testApp.fetch, port: PORT });

  const owner = await signUp(`entitlement-owner-${Date.now()}@example.com`);
  ownerId = owner.userId;
  ownerCookie = owner.cookie;

  const solo = await signUp(`entitlement-solo-${Date.now()}@example.com`);
  soloId = solo.userId;
  soloCookie = solo.cookie;

  const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Entitlement Test Org",
      slug: `entitlement-test-org-${Date.now()}`,
    }),
  });
  const org = (await orgRes.json()) as { id: string };
  orgId = org.id;
});

afterAll(async () => {
  await withSystemScope(async (tx) => {
    await tx.delete(organizationBilling).where(eq(organizationBilling.organizationId, orgId));
    await tx.delete(individualBilling).where(eq(individualBilling.userId, soloId));
    await tx.delete(individualBilling).where(eq(individualBilling.userId, ownerId));
  });
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(eq(userTable.id, ownerId));
  await db.delete(userTable).where(eq(userTable.id, soloId));
  await new Promise((resolve) => server.close(resolve));
});

describe("requireFeature — organization scope", () => {
  it("blocks a route gated on a feature the org's plan (default free) doesn't include", async () => {
    const res = await fetch(`http://localhost:${PORT}/test/org-feature`, {
      headers: { Cookie: ownerCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(402);
    expect(body.error?.code).toBe("PAYMENT_REQUIRED");
  });

  it("allows the route once the org is upgraded to a plan that includes the feature", async () => {
    await withOrgScope(orgId, async (tx) => {
      await ensureBillingRow(tx, orgId);
      await updateBillingByOrgId(tx, orgId, { plan: "growth" });
    });

    const res = await fetch(`http://localhost:${PORT}/test/org-feature`, {
      headers: { Cookie: ownerCookie },
    });
    expect(res.status).toBe(200);
  });

  it("rejects with a distinct error when there's no active organization at all", async () => {
    const res = await fetch(`http://localhost:${PORT}/test/org-feature`, {
      headers: { Cookie: soloCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });
});

describe("requireFeature — individual scope", () => {
  it("blocks a route gated on a feature the user's plan (default individual_free) doesn't include", async () => {
    const res = await fetch(`http://localhost:${PORT}/test/individual-feature`, {
      headers: { Cookie: soloCookie },
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(402);
    expect(body.error?.code).toBe("PAYMENT_REQUIRED");
  });

  it("allows the route once the user is upgraded to a plan that includes the feature", async () => {
    await withUserScope(soloId, async (tx) => {
      await ensureUserBillingRow(tx, soloId);
      await updateUserBillingByUserId(tx, soloId, { plan: "individual_pro" });
    });

    const res = await fetch(`http://localhost:${PORT}/test/individual-feature`, {
      headers: { Cookie: soloCookie },
    });
    expect(res.status).toBe(200);
  });

  it("works for a B2B2C session too (individual scope ignores the active organization)", async () => {
    await withUserScope(ownerId, async (tx) => {
      await ensureUserBillingRow(tx, ownerId);
      await updateUserBillingByUserId(tx, ownerId, { plan: "individual_pro" });
    });

    const res = await fetch(`http://localhost:${PORT}/test/individual-feature`, {
      headers: { Cookie: ownerCookie },
    });
    expect(res.status).toBe(200);
  });
});
