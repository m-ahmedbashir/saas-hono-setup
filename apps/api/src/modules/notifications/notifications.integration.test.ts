import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { createHmac } from "node:crypto";
import {
  db,
  eq,
  user as userTable,
  organization as organizationTable,
  organizationBilling as billingTable,
  notification as notificationTable,
  insertNotification,
  withUserScope,
  withSystemScope,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";
import { notifyUser } from "./notifications.service";

// Hits the real dev database, same pattern as profile.integration.test.ts and
// billing.integration.test.ts.

const PORT = 8812;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let userId: string;
let userCookie: string;
let otherUserId: string;
let otherUserCookie: string;
let staffUserId: string;
let orgId: string;

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Notifications Test" }),
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

  const owner = await signUp(`notifications-test-${Date.now()}@example.com`);
  userId = owner.userId;
  userCookie = owner.cookie;

  const other = await signUp(`notifications-other-${Date.now()}@example.com`);
  otherUserId = other.userId;
  otherUserCookie = other.cookie;

  // Platform staff account, needed for the payment-failed trigger test below —
  // notifyUsers(getPlatformStaffUserIds()) is the only real audience for that trigger
  // (see billing.handlers.ts's buildBillingIssueNotification comment).
  const staffEmail = `notifications-staff-${Date.now()}@example.com`;
  const created = await auth.api.createUser({
    body: {
      email: staffEmail,
      password: "password1234",
      name: "Notifications Staff",
      role: "admin",
    },
  });
  staffUserId = created.user.id;

  const orgRes = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
    body: JSON.stringify({
      name: "Notifications Test Org",
      slug: `notifications-test-org-${Date.now()}`,
    }),
  });
  const org = (await orgRes.json()) as { id: string };
  orgId = org.id;
});

afterAll(async () => {
  await withSystemScope(async (tx) => {
    await tx.delete(notificationTable).where(eq(notificationTable.userId, userId));
    await tx.delete(notificationTable).where(eq(notificationTable.userId, otherUserId));
    await tx.delete(notificationTable).where(eq(notificationTable.userId, staffUserId));
    await tx.delete(billingTable).where(eq(billingTable.organizationId, orgId));
  });
  await db.delete(organizationTable).where(eq(organizationTable.id, orgId));
  await db.delete(userTable).where(eq(userTable.id, userId));
  await db.delete(userTable).where(eq(userTable.id, otherUserId));
  await db.delete(userTable).where(eq(userTable.id, staffUserId));
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /notifications", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/notifications`, {
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("returns an empty list and zero unreadCount before anything has been created", async () => {
    const res = await fetch(`http://localhost:${PORT}/notifications`, {
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const body = (await res.json()) as {
      data: { notifications: unknown[]; total: number; unreadCount: number };
    };
    expect(res.status).toBe(200);
    expect(body.data.notifications).toEqual([]);
    expect(body.data.total).toBe(0);
    expect(body.data.unreadCount).toBe(0);
  });

  it("lists only the caller's own notifications, newest first, with a correct unreadCount", async () => {
    await notifyUser(userId, { title: "First", body: "Oldest" });
    await notifyUser(userId, { title: "Second", body: "Newest" });
    await notifyUser(otherUserId, { title: "Not yours", body: "Belongs to someone else" });

    const res = await fetch(`http://localhost:${PORT}/notifications`, {
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const body = (await res.json()) as {
      data: { notifications: { title: string }[]; total: number; unreadCount: number };
    };
    expect(res.status).toBe(200);
    expect(body.data.total).toBe(2);
    expect(body.data.unreadCount).toBe(2);
    expect(body.data.notifications.map((n) => n.title)).toEqual(["Second", "First"]);
  });
});

describe("PATCH /notifications/:id/read", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/notifications/some-id/read`, {
      method: "PATCH",
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("404s for a notification that belongs to a different user", async () => {
    const record = await notifyUser(userId, { title: "Owned by userId", body: "..." });
    const listRes = await fetch(`http://localhost:${PORT}/notifications`, {
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const listBody = (await listRes.json()) as { data: { notifications: { id: string }[] } };
    const targetId = listBody.data.notifications[0]!.id;
    void record;

    const res = await fetch(`http://localhost:${PORT}/notifications/${targetId}/read`, {
      method: "PATCH",
      headers: { Origin: ORIGIN, Cookie: otherUserCookie },
    });
    expect(res.status).toBe(404);
  });

  it("404s for a nonexistent id", async () => {
    const res = await fetch(`http://localhost:${PORT}/notifications/does-not-exist/read`, {
      method: "PATCH",
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    expect(res.status).toBe(404);
  });

  it("marks the caller's own notification read", async () => {
    const listRes = await fetch(`http://localhost:${PORT}/notifications?unreadOnly=true`, {
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const listBody = (await listRes.json()) as { data: { notifications: { id: string }[] } };
    const targetId = listBody.data.notifications[0]!.id;

    const res = await fetch(`http://localhost:${PORT}/notifications/${targetId}/read`, {
      method: "PATCH",
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const body = (await res.json()) as { data: { read: boolean; id: string } };
    expect(res.status).toBe(200);
    expect(body.data.id).toBe(targetId);
    expect(body.data.read).toBe(true);
  });
});

describe("POST /notifications/read-all", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/notifications/read-all`, {
      method: "POST",
      headers: { Origin: ORIGIN },
    });
    expect(res.status).toBe(401);
  });

  it("marks every unread notification of the caller's as read, without touching other users'", async () => {
    await notifyUser(userId, { title: "Unread A", body: "..." });
    await notifyUser(userId, { title: "Unread B", body: "..." });

    const res = await fetch(`http://localhost:${PORT}/notifications/read-all`, {
      method: "POST",
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    expect(res.status).toBe(200);

    const afterRes = await fetch(`http://localhost:${PORT}/notifications?unreadOnly=true`, {
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const afterBody = (await afterRes.json()) as { data: { total: number } };
    expect(afterBody.data.total).toBe(0);

    const otherRes = await fetch(`http://localhost:${PORT}/notifications?unreadOnly=true`, {
      headers: { Origin: ORIGIN, Cookie: otherUserCookie },
    });
    const otherBody = (await otherRes.json()) as { data: { total: number } };
    expect(otherBody.data.total).toBe(1);
  }, 15000);
});

describe("Row-Level Security on the notification table", () => {
  // Same proof pattern as profile.integration.test.ts's RLS block — see its comment for
  // why this must be tested directly rather than trusted from the migration alone.
  it("hides the row from an unscoped query, and from a different user's scope", async () => {
    const record = await withUserScope(userId, (tx) =>
      insertNotification(tx, { id: crypto.randomUUID(), userId, title: "RLS check", body: "..." }),
    );

    const unscoped = await db
      .select()
      .from(notificationTable)
      .where(eq(notificationTable.id, record.id));
    expect(unscoped).toEqual([]);

    const wrongUserScope = await withUserScope("some-other-user-id", (tx) =>
      tx.select().from(notificationTable).where(eq(notificationTable.id, record.id)),
    );
    expect(wrongUserScope).toEqual([]);

    const rightUserScope = await withUserScope(userId, (tx) =>
      tx.select().from(notificationTable).where(eq(notificationTable.id, record.id)),
    );
    expect(rightUserScope).toHaveLength(1);
  });
});

describe("Payment-failed trigger (billing webhook -> platform staff notification)", () => {
  it("notifies every platform staff account when an org's subscription goes past_due", async () => {
    // Seed a real organization_billing row via the same checkout-completed webhook flow
    // billing.integration.test.ts already proves, so this test starts from realistic
    // state rather than inserting a billing row by hand.
    const subscriptionId = `sub_test_notif_fake_${Date.now()}`;
    const checkoutPayload = JSON.stringify({
      // Unique per run — see billing.integration.test.ts's identical comment on why a
      // hardcoded event id would collide with the immutable billing_events ledger.
      id: `evt_test_notif_checkout_completed_${Date.now()}`,
      object: "event",
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: "cs_test_notif_fake",
          object: "checkout.session",
          client_reference_id: orgId,
          customer: "cus_test_notif_fake",
          subscription: subscriptionId,
          metadata: { ownerType: "organization", ownerId: orgId, planId: "starter" },
        },
      },
    });
    await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signWebhookPayload(checkoutPayload),
      },
      body: checkoutPayload,
    });

    const updatedPayload = JSON.stringify({
      // Unique per run — see billing.integration.test.ts's identical comment on why a
      // hardcoded event id would collide with the immutable billing_events ledger.
      id: `evt_test_notif_subscription_updated_${Date.now()}`,
      object: "event",
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: subscriptionId,
          object: "subscription",
          status: "past_due",
          items: { data: [{ quantity: 1 }] },
        },
      },
    });
    const res = await fetch(`http://localhost:${PORT}/billing/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signWebhookPayload(updatedPayload),
      },
      body: updatedPayload,
    });
    expect(res.status).toBe(200);

    // getPlatformStaffUserIds() fans out to every platform staff account that exists at
    // the moment it runs, by design — a different, concurrently-running test file's own
    // past_due trigger legitimately notifies this same staff account too (each test
    // creates its own admin account, but they're all real platform staff sharing the
    // same dev database). So this asserts the *specific* notification for this test's
    // own org exists, not that it's the only notification this staff account ever
    // received during the whole suite's run.
    const staffNotifications = await withUserScope(staffUserId, (tx) =>
      tx.select().from(notificationTable).where(eq(notificationTable.userId, staffUserId)),
    );
    const forThisOrg = staffNotifications.find(
      (n) => n.actionUrl === `/dashboard/organizations/${orgId}`,
    );
    expect(forThisOrg?.title).toContain("Payment failed");
  });
});
