import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { createHmac } from "node:crypto";
import { db, eq, organization as organizationTable, user as userTable, billing as billingTable } from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Hits the real dev database, same as the WS integration test — see PROGRESS.md. The
// checkout-success case also hits the real Stripe test-mode API (skipped if no price is
// configured); the webhook cases self-sign payloads with the real STRIPE_WEBHOOK_SECRET
// instead, so they need no network access and always run.

const PORT = 8801;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let ownerId: string;
let ownerCookie: string;
let memberId: string;
let memberCookie: string;
let orgId: string;

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Billing Test" }),
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

  const owner = await signUp(`billing-owner-${Date.now()}@example.com`);
  ownerId = owner.userId;
  ownerCookie = owner.cookie;

  const member = await signUp(`billing-member-${Date.now()}@example.com`);
  memberId = member.userId;
  memberCookie = member.cookie;

  const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
    body: JSON.stringify({ name: "Billing Test Org", slug: `billing-test-org-${Date.now()}` }),
  });
  const org = (await orgRes.json()) as { id: string };
  orgId = org.id;

  await auth.api.addMember({ body: { userId: memberId, role: "member", organizationId: orgId } });

  // addMember alone doesn't make this org the member's *active* org — without this,
  // injectUserContext resolves them as B2C (no active org), and requirePermission's
  // B2C passthrough would let them through before ever checking their role.
  await fetch(`http://localhost:${PORT}/api/auth/organization/set-active`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: memberCookie },
    body: JSON.stringify({ organizationId: orgId }),
  });
});

afterAll(async () => {
  await db.delete(billingTable).where(eq(billingTable.organizationId, orgId));
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(eq(userTable.id, ownerId));
  await db.delete(userTable).where(eq(userTable.id, memberId));
  await new Promise((resolve) => server.close(resolve));
});

describe("POST /billing/checkout", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN },
      body: JSON.stringify({ planId: "starter", quantity: 1 }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a member without billing:manage permission", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: memberCookie },
      body: JSON.stringify({ planId: "starter", quantity: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a malformed body via the zValidator pre-route guard, in our envelope shape", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
      body: JSON.stringify({ planId: "not-a-real-plan", quantity: -5 }),
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a plan with no billable price configured (free)", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
      body: JSON.stringify({ planId: "free", quantity: 1 }),
    });
    expect(res.status).toBe(422);
  });

  it.skipIf(!process.env.STRIPE_PRICE_STARTER)(
    "returns a real Stripe checkout URL for an owner on a billable plan",
    async () => {
      const res = await fetch(`http://localhost:${PORT}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
        body: JSON.stringify({ planId: "starter", quantity: 3 }),
      });
      const body = (await res.json()) as { success: boolean; data?: { checkoutUrl: string } };
      expect(res.status).toBe(200);
      expect(body.data?.checkoutUrl).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    }
  );
});

describe("POST /billing/webhook", () => {
  it("rejects a request with no signature header", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "product.created" }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a request with an invalid signature", async () => {
    const res = await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": "t=1,v1=not-a-real-signature" },
      body: JSON.stringify({ type: "product.created" }),
    });
    expect(res.status).toBe(422);
  });

  it("acks an event type it doesn't map, without touching the DB", async () => {
    const payload = JSON.stringify({
      id: "evt_test_unmapped",
      object: "event",
      type: "product.created",
      data: { object: { id: "prod_test" } },
    });
    const res = await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": signWebhookPayload(payload) },
      body: payload,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
  });

  it("creates/updates the billing row from a signed checkout.session.completed event", async () => {
    const payload = JSON.stringify({
      id: "evt_test_checkout_completed",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_fake",
          object: "checkout.session",
          client_reference_id: orgId,
          customer: "cus_test_fake",
          subscription: "sub_test_fake",
          metadata: { planId: "starter" },
        },
      },
    });
    const res = await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "stripe-signature": signWebhookPayload(payload) },
      body: payload,
    });
    expect(res.status).toBe(200);

    const [row] = await db.select().from(billingTable).where(eq(billingTable.organizationId, orgId));
    expect(row?.plan).toBe("starter");
    expect(row?.providerCustomerId).toBe("cus_test_fake");
    expect(row?.providerSubscriptionId).toBe("sub_test_fake");
    expect(row?.subscriptionStatus).toBe("active");
  });
});
