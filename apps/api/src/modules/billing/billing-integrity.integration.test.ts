import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { createHmac } from "node:crypto";
import {
  db,
  eq,
  organization as organizationTable,
  user as userTable,
  notification as notificationTable,
  organizationBilling as billingTable,
  billingEvents as billingEventsTable,
  invoices as invoicesTable,
  withSystemScope,
  withUserScope,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Hits the real dev database, same pattern as billing.integration.test.ts. Proves the
// design in specs/billing-integrity-plan.md: an append-only billing_events ledger
// (inbound idempotency + audit trail), a curated invoices table, and the two
// out-of-order-delivery guards (Fix 3, Fix 4).

const PORT = 8813;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let ownerId: string;
let ownerCookie: string;
let staffUserId: string;
let orgId: string;
const cleanupSubscriptionIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Billing Integrity Test" }),
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

async function sendWebhook(payload: string) {
  return fetch(`http://localhost:${PORT}/billing/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signWebhookPayload(payload),
    },
    body: payload,
  });
}

function checkoutCompletedPayload(eventId: string, subscriptionId: string, createdAt: number) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    created: createdAt,
    data: {
      object: {
        id: `cs_test_${eventId}`,
        object: "checkout.session",
        client_reference_id: orgId,
        customer: `cus_test_${eventId}`,
        subscription: subscriptionId,
        metadata: {
          ownerType: "organization",
          ownerId: orgId,
          planId: "starter",
          seatQuantity: "3",
        },
      },
    },
  });
}

function subscriptionUpdatedPayload(
  eventId: string,
  subscriptionId: string,
  status: string,
  createdAt: number,
) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "customer.subscription.updated",
    created: createdAt,
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        status,
        items: { data: [{ quantity: 1 }] },
      },
    },
  });
}

function subscriptionDeletedPayload(eventId: string, subscriptionId: string, createdAt: number) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "customer.subscription.deleted",
    created: createdAt,
    data: {
      object: {
        id: subscriptionId,
        object: "subscription",
        status: "canceled",
        items: { data: [{ quantity: 1 }] },
      },
    },
  });
}

function invoicePaidPayload(
  eventId: string,
  subscriptionId: string,
  paymentIntentId: string,
  createdAt: number,
) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "invoice.paid",
    created: createdAt,
    data: {
      object: {
        id: `in_test_${eventId}`,
        object: "invoice",
        amount_paid: 4900,
        currency: "usd",
        hosted_invoice_url: `https://invoice.stripe.com/i/test_${eventId}`,
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: subscriptionId },
        },
        payments: {
          data: [{ payment: { type: "payment_intent", payment_intent: paymentIntentId } }],
        },
      },
    },
  });
}

// Stripe sends charge.refunded for partial refunds too; `refunded` is true only once the
// charge is refunded in full.
function chargeRefundedPayload(
  eventId: string,
  paymentIntentId: string,
  createdAt: number,
  { fully = true }: { fully?: boolean } = {},
) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "charge.refunded",
    created: createdAt,
    data: {
      object: {
        id: `ch_test_${eventId}`,
        object: "charge",
        payment_intent: paymentIntentId,
        amount: 4900,
        amount_refunded: fully ? 4900 : 1000,
        refunded: fully,
      },
    },
  });
}

function disputeCreatedPayload(eventId: string, paymentIntentId: string, createdAt: number) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "charge.dispute.created",
    created: createdAt,
    data: {
      object: {
        id: `dp_test_${eventId}`,
        object: "dispute",
        charge: `ch_test_${eventId}`,
        payment_intent: paymentIntentId,
      },
    },
  });
}

function invoicePaymentFailedPayload(eventId: string, subscriptionId: string, createdAt: number) {
  return JSON.stringify({
    id: eventId,
    object: "event",
    type: "invoice.payment_failed",
    created: createdAt,
    data: {
      object: {
        id: `in_test_${eventId}`,
        object: "invoice",
        parent: {
          type: "subscription_details",
          subscription_details: { subscription: subscriptionId },
        },
      },
    },
  });
}

beforeAll(async () => {
  server = serve({ fetch: app.fetch, port: PORT });

  const owner = await signUp(`billing-integrity-owner-${Date.now()}@example.com`);
  ownerId = owner.userId;
  ownerCookie = owner.cookie;

  const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
    body: JSON.stringify({
      name: "Billing Integrity Test Org",
      slug: `billing-integrity-org-${Date.now()}`,
    }),
  });
  const org = (await orgRes.json()) as { id: string };
  orgId = org.id;

  const staffEmail = `billing-integrity-staff-${Date.now()}@example.com`;
  const created = await auth.api.createUser({
    body: {
      email: staffEmail,
      password: "password1234",
      name: "Billing Integrity Staff",
      role: "admin",
    },
  });
  staffUserId = created.user.id;
});

afterAll(async () => {
  await withSystemScope(async (tx) => {
    for (const subscriptionId of cleanupSubscriptionIds) {
      await tx
        .delete(invoicesTable)
        .where(eq(invoicesTable.providerSubscriptionId, subscriptionId));
    }
    await tx.delete(billingTable).where(eq(billingTable.organizationId, orgId));
  });
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(eq(userTable.id, ownerId));
  await db.delete(userTable).where(eq(userTable.id, staffUserId));
  await new Promise((resolve) => server.close(resolve));
});

describe("Inbound idempotency (Fix 1)", () => {
  it("replaying the same signed event twice records exactly one ledger row and fires exactly one notification", async () => {
    const subscriptionId = `sub_test_idem_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    await sendWebhook(
      checkoutCompletedPayload(
        `evt_test_idem_checkout_${Date.now()}`,
        subscriptionId,
        Math.floor(Date.now() / 1000),
      ),
    );

    const eventId = `evt_test_idem_update_${Date.now()}`;
    const payload = subscriptionUpdatedPayload(
      eventId,
      subscriptionId,
      "past_due",
      Math.floor(Date.now() / 1000),
    );

    const first = await sendWebhook(payload);
    expect(first.status).toBe(200);
    const second = await sendWebhook(payload);
    expect(second.status).toBe(200);

    const ledgerRows = await withSystemScope((tx) =>
      tx.select().from(billingEventsTable).where(eq(billingEventsTable.stripeEventId, eventId)),
    );
    expect(ledgerRows).toHaveLength(1);

    // getPlatformStaffUserIds() fans out to every platform staff account that exists at
    // the moment it runs, by design — a different, concurrently-running test file's own
    // past_due trigger can legitimately notify this same staff account too. So this
    // counts how many notifications exist *for this specific org*, not the staff
    // account's total notification count across the whole suite's concurrent run — a
    // duplicate would show up as 2 matches for this org's actionUrl, which is exactly
    // the bug this test guards against.
    const staffNotifications = await withUserScope(staffUserId, (tx) =>
      tx.select().from(notificationTable).where(eq(notificationTable.userId, staffUserId)),
    );
    const forThisOrg = staffNotifications.filter(
      (n) => n.actionUrl === `/dashboard/organizations/${orgId}`,
    );
    expect(forThisOrg).toHaveLength(1);
  }, 15000);
});

describe("Expanded event coverage", () => {
  it("invoice.paid creates an invoices row and records the ledger event", async () => {
    const subscriptionId = `sub_test_invoice_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    await sendWebhook(
      checkoutCompletedPayload(
        `evt_test_invoice_checkout_${Date.now()}`,
        subscriptionId,
        Math.floor(Date.now() / 1000),
      ),
    );

    const paymentIntentId = `pi_test_${Date.now()}`;
    const eventId = `evt_test_invoice_paid_${Date.now()}`;
    const res = await sendWebhook(
      invoicePaidPayload(eventId, subscriptionId, paymentIntentId, Math.floor(Date.now() / 1000)),
    );
    expect(res.status).toBe(200);

    const [ledgerRow] = await withSystemScope((tx) =>
      tx.select().from(billingEventsTable).where(eq(billingEventsTable.stripeEventId, eventId)),
    );
    expect(ledgerRow?.type).toBe("invoice_paid");

    const [invoiceRow] = await withSystemScope((tx) =>
      tx
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.stripePaymentIntentId, paymentIntentId)),
    );
    expect(invoiceRow?.amountTotal).toBe(4900);
    expect(invoiceRow?.currency).toBe("usd");
    expect(invoiceRow?.status).toBe("paid");
    expect(invoiceRow?.organizationId).toBe(orgId);
  });

  it("invoice.payment_failed and charge.dispute.created are recorded in the ledger", async () => {
    const subscriptionId = `sub_test_events_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    await sendWebhook(
      checkoutCompletedPayload(
        `evt_test_events_checkout_${Date.now()}`,
        subscriptionId,
        Math.floor(Date.now() / 1000),
      ),
    );

    const failedEventId = `evt_test_payment_failed_${Date.now()}`;
    const failedRes = await sendWebhook(
      invoicePaymentFailedPayload(failedEventId, subscriptionId, Math.floor(Date.now() / 1000)),
    );
    expect(failedRes.status).toBe(200);

    const disputeEventId = `evt_test_dispute_${Date.now()}`;
    const disputeRes = await sendWebhook(
      disputeCreatedPayload(
        disputeEventId,
        `pi_test_dispute_${Date.now()}`,
        Math.floor(Date.now() / 1000),
      ),
    );
    expect(disputeRes.status).toBe(200);

    const rows = await withSystemScope((tx) =>
      tx
        .select()
        .from(billingEventsTable)
        .where(eq(billingEventsTable.stripeEventId, failedEventId)),
    );
    expect(rows[0]?.type).toBe("invoice_payment_failed");

    const disputeRows = await withSystemScope((tx) =>
      tx
        .select()
        .from(billingEventsTable)
        .where(eq(billingEventsTable.stripeEventId, disputeEventId)),
    );
    expect(disputeRows[0]?.type).toBe("charge_dispute_created");
  });
});

describe("Out-of-order delivery (Fix 3)", () => {
  it("an older event never overwrites a row a newer event already applied, but is still ledger-recorded", async () => {
    const subscriptionId = `sub_test_order_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    await sendWebhook(
      checkoutCompletedPayload(
        `evt_test_order_checkout_${Date.now()}`,
        subscriptionId,
        Math.floor(Date.now() / 1000),
      ),
    );

    const now = Math.floor(Date.now() / 1000);
    const newer = await sendWebhook(
      subscriptionUpdatedPayload(
        `evt_test_order_newer_${Date.now()}`,
        subscriptionId,
        "active",
        now,
      ),
    );
    expect(newer.status).toBe(200);

    const olderEventId = `evt_test_order_older_${Date.now()}`;
    const older = await sendWebhook(
      subscriptionUpdatedPayload(olderEventId, subscriptionId, "past_due", now - 3600),
    );
    expect(older.status).toBe(200);

    const [row] = await withSystemScope((tx) =>
      tx.select().from(billingTable).where(eq(billingTable.providerSubscriptionId, subscriptionId)),
    );
    // The older, out-of-order event must not have regressed the status back to past_due.
    expect(row?.subscriptionStatus).toBe("active");

    const ledgerRows = await withSystemScope((tx) =>
      tx
        .select()
        .from(billingEventsTable)
        .where(eq(billingEventsTable.stripeEventId, olderEventId)),
    );
    expect(ledgerRows).toHaveLength(1);

    const evenNewer = await sendWebhook(
      subscriptionUpdatedPayload(
        `evt_test_order_newest_${Date.now()}`,
        subscriptionId,
        "canceled",
        now + 3600,
      ),
    );
    expect(evenNewer.status).toBe(200);

    const [finalRow] = await withSystemScope((tx) =>
      tx.select().from(billingTable).where(eq(billingTable.providerSubscriptionId, subscriptionId)),
    );
    expect(finalRow?.subscriptionStatus).toBe("canceled");
    // A canceled status reached via subscription.updated ends the subscription just the
    // same as subscription.deleted does — see the "Ending a subscription" block below.
    expect(finalRow?.plan).toBe("free");
  }, 15000);
});

// The billing row's `plan` is what entitlements and seat limits resolve from
// (entitlement.middleware.ts / getOrganizationSeatLimit), so a subscription that has ended
// must stop granting its paid plan — otherwise canceling keeps paid access forever. Stripe's
// webhook stays the single writer of that change.
describe("Ending a subscription", () => {
  it("customer.subscription.deleted returns the organization to the default plan, keeping the subscription id", async () => {
    const subscriptionId = `sub_test_ended_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    const now = Math.floor(Date.now() / 1000);
    await sendWebhook(
      checkoutCompletedPayload(`evt_test_ended_checkout_${Date.now()}`, subscriptionId, now),
    );

    const [paid] = await withSystemScope((tx) =>
      tx.select().from(billingTable).where(eq(billingTable.providerSubscriptionId, subscriptionId)),
    );
    expect(paid?.plan).toBe("starter");
    // The seats paid for at checkout — what caps membership while the subscription is live
    // (billing.service.ts's getOrganizationSeatUsage). Carried in checkout metadata, since
    // Stripe's checkout.session.completed payload doesn't include line-item quantities.
    expect(paid?.seatQuantity).toBe(3);

    const res = await sendWebhook(
      subscriptionDeletedPayload(`evt_test_ended_deleted_${Date.now()}`, subscriptionId, now + 60),
    );
    expect(res.status).toBe(200);

    const [ended] = await withSystemScope((tx) =>
      tx.select().from(billingTable).where(eq(billingTable.providerSubscriptionId, subscriptionId)),
    );
    expect(ended?.subscriptionStatus).toBe("canceled");
    expect(ended?.plan).toBe("free");
    // Kept, not cleared: a late event for the ended subscription (e.g. its final invoice)
    // must still resolve to this owner rather than be rejected as unknown.
    expect(ended?.providerSubscriptionId).toBe(subscriptionId);
  }, 15000);
});

// Stripe stamps events to the second, so two events for one subscription can share a
// timestamp — e.g. canceling immediately emits subscription.updated and .deleted within
// the same second. The ordering guard must still let the ending event win.
describe("Same-second event ordering", () => {
  async function rowFor(subscriptionId: string) {
    const [row] = await withSystemScope((tx) =>
      tx.select().from(billingTable).where(eq(billingTable.providerSubscriptionId, subscriptionId)),
    );
    return row;
  }

  it("a cancellation stamped the same second as an already-applied update still ends the subscription", async () => {
    const subscriptionId = `sub_test_tie_cancel_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    const t = Math.floor(Date.now() / 1000);
    await sendWebhook(
      checkoutCompletedPayload(`evt_tie_a_checkout_${Date.now()}`, subscriptionId, t),
    );
    await sendWebhook(
      subscriptionUpdatedPayload(
        `evt_tie_a_updated_${Date.now()}`,
        subscriptionId,
        "active",
        t + 1,
      ),
    );
    await sendWebhook(
      subscriptionDeletedPayload(`evt_tie_a_deleted_${Date.now()}`, subscriptionId, t + 1),
    );

    const row = await rowFor(subscriptionId);
    expect(row?.subscriptionStatus).toBe("canceled");
    expect(row?.plan).toBe("free");
  }, 20000);

  it("an update stamped the same second as an already-applied cancellation can't undo it", async () => {
    const subscriptionId = `sub_test_tie_update_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    const t = Math.floor(Date.now() / 1000);
    await sendWebhook(
      checkoutCompletedPayload(`evt_tie_b_checkout_${Date.now()}`, subscriptionId, t),
    );
    await sendWebhook(
      subscriptionDeletedPayload(`evt_tie_b_deleted_${Date.now()}`, subscriptionId, t + 1),
    );
    await sendWebhook(
      subscriptionUpdatedPayload(
        `evt_tie_b_updated_${Date.now()}`,
        subscriptionId,
        "active",
        t + 1,
      ),
    );

    const row = await rowFor(subscriptionId);
    expect(row?.subscriptionStatus).toBe("canceled");
    expect(row?.plan).toBe("free");
  }, 20000);

  // A new subscription on the same billing row starts its own event ordering — otherwise
  // its events are compared with the previous subscription's timestamps and wrongly skipped.
  it("a new subscription's events aren't compared against the previous subscription's", async () => {
    const t = Math.floor(Date.now() / 1000);
    const oldSubscription = `sub_test_old_${Date.now()}`;
    const newSubscription = `sub_test_new_${Date.now()}`;
    cleanupSubscriptionIds.push(oldSubscription, newSubscription);

    await sendWebhook(
      checkoutCompletedPayload(`evt_old_checkout_${Date.now()}`, oldSubscription, t),
    );
    // The old subscription's last event carries a later timestamp than the new one's will.
    await sendWebhook(
      subscriptionUpdatedPayload(
        `evt_old_updated_${Date.now()}`,
        oldSubscription,
        "active",
        t + 900,
      ),
    );
    await sendWebhook(
      checkoutCompletedPayload(`evt_new_checkout_${Date.now()}`, newSubscription, t + 5),
    );
    await sendWebhook(
      subscriptionUpdatedPayload(
        `evt_new_updated_${Date.now()}`,
        newSubscription,
        "past_due",
        t + 10,
      ),
    );

    const row = await rowFor(newSubscription);
    expect(row?.subscriptionStatus).toBe("past_due");
  }, 25000);
});

describe("Partial refunds", () => {
  it("marks a partial refund as partially refunded, and only a full refund as refunded", async () => {
    const subscriptionId = `sub_test_partial_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    const t = Math.floor(Date.now() / 1000);
    const paymentIntentId = `pi_test_partial_${Date.now()}`;
    await sendWebhook(
      checkoutCompletedPayload(`evt_partial_checkout_${Date.now()}`, subscriptionId, t),
    );
    await sendWebhook(
      invoicePaidPayload(`evt_partial_invoice_${Date.now()}`, subscriptionId, paymentIntentId, t),
    );

    async function invoiceStatus() {
      const [row] = await withSystemScope((tx) =>
        tx
          .select()
          .from(invoicesTable)
          .where(eq(invoicesTable.stripePaymentIntentId, paymentIntentId)),
      );
      return row?.status;
    }

    await sendWebhook(
      chargeRefundedPayload(`evt_partial_1_${Date.now()}`, paymentIntentId, t + 1, {
        fully: false,
      }),
    );
    expect(await invoiceStatus()).toBe("partially_refunded");

    await sendWebhook(
      chargeRefundedPayload(`evt_partial_full_${Date.now()}`, paymentIntentId, t + 2),
    );
    expect(await invoiceStatus()).toBe("refunded");

    // A delayed redelivery of the earlier partial refund mustn't downgrade a full refund.
    await sendWebhook(
      chargeRefundedPayload(`evt_partial_late_${Date.now()}`, paymentIntentId, t + 1, {
        fully: false,
      }),
    );
    expect(await invoiceStatus()).toBe("refunded");
  }, 25000);
});

describe("Refund-before-invoice race (Fix 4)", () => {
  it("a refund arriving before its invoice fails loudly and succeeds once retried after the invoice lands", async () => {
    const subscriptionId = `sub_test_race_${Date.now()}`;
    cleanupSubscriptionIds.push(subscriptionId);
    await sendWebhook(
      checkoutCompletedPayload(
        `evt_test_race_checkout_${Date.now()}`,
        subscriptionId,
        Math.floor(Date.now() / 1000),
      ),
    );

    const paymentIntentId = `pi_test_race_${Date.now()}`;
    const refundEventId = `evt_test_race_refund_${Date.now()}`;
    const refundPayload = chargeRefundedPayload(
      refundEventId,
      paymentIntentId,
      Math.floor(Date.now() / 1000),
    );

    const prematureRefund = await sendWebhook(refundPayload);
    expect(prematureRefund.status).toBe(500);

    // The failed attempt's transaction (ledger insert included) must have rolled back —
    // otherwise the retry below would be wrongly treated as an already-processed
    // duplicate instead of a fresh attempt.
    const ledgerAfterFailure = await withSystemScope((tx) =>
      tx
        .select()
        .from(billingEventsTable)
        .where(eq(billingEventsTable.stripeEventId, refundEventId)),
    );
    expect(ledgerAfterFailure).toHaveLength(0);

    const invoicePaidRes = await sendWebhook(
      invoicePaidPayload(
        `evt_test_race_invoice_${Date.now()}`,
        subscriptionId,
        paymentIntentId,
        Math.floor(Date.now() / 1000),
      ),
    );
    expect(invoicePaidRes.status).toBe(200);

    const retriedRefund = await sendWebhook(refundPayload);
    expect(retriedRefund.status).toBe(200);

    const [invoiceRow] = await withSystemScope((tx) =>
      tx
        .select()
        .from(invoicesTable)
        .where(eq(invoicesTable.stripePaymentIntentId, paymentIntentId)),
    );
    expect(invoiceRow?.status).toBe("refunded");
  }, 15000);
});

describe("Immutability of the billing_events ledger", () => {
  // Proves REVOKE UPDATE, DELETE is actually enforced, not just present in the
  // migration — same "prove it, don't trust the migration alone" discipline as this
  // repo's RLS tests. `db` (imported from @repo/db) already connects as the restricted
  // app_user role (APP_DATABASE_URL, never the owner role) — see AGENTS.md's Row-Level
  // Security section — so this genuinely exercises the same connection every other
  // query in this app uses, not a separate owner-role connection that would give a
  // false pass.
  it("rejects UPDATE and DELETE from the app's own runtime role", async () => {
    const [row] = await withSystemScope((tx) =>
      tx
        .select()
        .from(billingEventsTable)
        .where(eq(billingEventsTable.type, "invoice_paid"))
        .limit(1),
    );
    expect(row).toBeDefined();

    await expect(
      db.update(billingEventsTable).set({ type: "x" }).where(eq(billingEventsTable.id, row!.id)),
    ).rejects.toThrow();

    await expect(
      db.delete(billingEventsTable).where(eq(billingEventsTable.id, row!.id)),
    ).rejects.toThrow();
  });
});
