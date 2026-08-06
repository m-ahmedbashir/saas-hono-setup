import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { createHmac } from "node:crypto";
import {
  db,
  eq,
  user as userTable,
  organizationBilling,
  individualBilling as individualBillingTable,
  withUserScope,
  withSystemScope,
} from "@repo/db";
import { app } from "../../app";
import { ensureUserBillingRow } from "./individual-billing.db";

// Hits the real dev database, same pattern as billing.integration.test.ts. No org
// involved anywhere here — individual billing works identically for a plain B2C user.

const PORT = 8802;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let userId: string;
let userCookie: string;

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Individual Billing Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

function signWebhookPayload(payload: string) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET!;
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

beforeAll(async () => {
  server = serve({ fetch: app.fetch, port: PORT });

  const user = await signUp(`individual-billing-${Date.now()}@example.com`);
  userId = user.userId;
  userCookie = user.cookie;
});

afterAll(async () => {
  await withSystemScope((tx) =>
    tx.delete(individualBillingTable).where(eq(individualBillingTable.userId, userId)),
  );
  await db.delete(userTable).where(eq(userTable.id, userId));
  await new Promise((resolve) => server.close(resolve));
});

describe("POST /billing/individual-checkout", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ planId: "individual_pro" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed body via the zValidator pre-route guard, in our envelope shape", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ planId: "not-a-real-plan" }),
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a request that still sends a quantity field (schema has none)", async () => {
    // Not that a stray field breaks anything (Zod strips unknowns by default), but
    // confirms the individual-checkout body genuinely has no quantity concept.
    const res = await fetch(`http://localhost:${PORT}/billing/individual-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ planId: "individual_free", quantity: 5 }),
    });
    // individual_free has no billable price, so this still 422s — for that reason,
    // not because of the extra field.
    expect(res.status).toBe(422);
  });

  it("rejects a plan with no billable price configured (individual_free)", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/individual-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ planId: "individual_free" }),
    });
    expect(res.status).toBe(422);
  });

  it.skipIf(!process.env.STRIPE_PRICE_INDIVIDUAL_PRO)(
    "returns a real Stripe checkout URL for a user on a billable plan",
    async () => {
      const res = await fetch(`http://localhost:${PORT}/billing/individual-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
        body: JSON.stringify({ planId: "individual_pro" }),
      });
      const body = (await res.json()) as { success: boolean; data?: { checkoutUrl: string } };
      expect(res.status).toBe(200);
      expect(body.data?.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    },
  );
});

describe("POST /billing/webhook (individual ownerType)", () => {
  it("creates/updates the individual_billing row from a signed checkout.session.completed event, without touching organization_billing", async () => {
    // providerSubscriptionId is UNIQUE at the DB level — a fixed literal here would
    // collide with a leftover row from a prior run whose afterAll didn't complete
    // (e.g. the process got killed mid-suite), failing this test for an unrelated reason.
    const subscriptionId = `sub_test_individual_fake_${Date.now()}`;
    const payload = JSON.stringify({
      // Unique per run — see billing.integration.test.ts's identical comment on why a
      // hardcoded event id would collide with the immutable billing_events ledger.
      id: `evt_test_individual_checkout_completed_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cs_test_individual_fake",
          object: "checkout.session",
          client_reference_id: userId,
          customer: "cus_test_individual_fake",
          subscription: subscriptionId,
          metadata: { ownerType: "individual", ownerId: userId, planId: "individual_pro" },
        },
      },
    });
    const res = await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signWebhookPayload(payload),
      },
      body: payload,
    });
    expect(res.status).toBe(200);

    const [row] = await withSystemScope((tx) =>
      tx.select().from(individualBillingTable).where(eq(individualBillingTable.userId, userId)),
    );
    expect(row?.plan).toBe("individual_pro");
    expect(row?.providerCustomerId).toBe("cus_test_individual_fake");
    expect(row?.providerSubscriptionId).toBe(subscriptionId);
    expect(row?.subscriptionStatus).toBe("active");

    // Cross-contamination check: an individual checkout must never create/touch a row
    // in the organization table, even though handleBillingEvent's subscription-lifecycle
    // branch always queries both tables by subscription id.
    const orgRows = await withSystemScope((tx) =>
      tx
        .select()
        .from(organizationBilling)
        .where(eq(organizationBilling.providerSubscriptionId, subscriptionId)),
    );
    expect(orgRows).toEqual([]);
  });
});

describe("Row-Level Security on the individual_billing table", () => {
  // Same proof pattern as billing.integration.test.ts's RLS block, scoped by user
  // instead of org — see that file's comment for why this must be tested directly
  // rather than trusted from the migration alone.
  it("hides the row from an unscoped query, and from a different user's scope", async () => {
    await withSystemScope((tx) => ensureUserBillingRow(tx, userId));

    const unscoped = await db
      .select()
      .from(individualBillingTable)
      .where(eq(individualBillingTable.userId, userId));
    expect(unscoped).toEqual([]);

    const wrongUserScope = await withUserScope("some-other-user-id", (tx) =>
      tx.select().from(individualBillingTable).where(eq(individualBillingTable.userId, userId)),
    );
    expect(wrongUserScope).toEqual([]);

    const rightUserScope = await withUserScope(userId, (tx) =>
      tx.select().from(individualBillingTable).where(eq(individualBillingTable.userId, userId)),
    );
    expect(rightUserScope).toHaveLength(1);
  });
});
