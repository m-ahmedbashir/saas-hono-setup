import { withSystemScope, organization, user, eq, type DbExecutor } from "@repo/db";
import { AppError, type BillingEvent } from "@repo/core";
import { billingService } from "./stripe-billing.service";
import {
  ensureBillingRow,
  updateBillingByOrgId,
  updateBillingBySubscriptionId,
} from "./organization-billing.db";
import {
  ensureUserBillingRow,
  updateUserBillingByUserId,
  updateUserBillingBySubscriptionId,
} from "./individual-billing.db";
import {
  notifyUsers,
  getPlatformStaffUserIds,
  type NotifyInput,
} from "../notifications/notifications.service";

/**
 * Full webhook flow: verify signature, parse into a normalized event, react to it. The
 * route only reads the request (header + raw body) and calls this once — see AGENTS.md.
 */
export async function processWebhook(
  payload: string,
  signature: string | undefined,
): Promise<void> {
  if (!signature) {
    throw new AppError("VALIDATION_ERROR", "Missing Stripe webhook signature");
  }

  const event = billingService.parseWebhookEvent(payload, signature);
  if (event) {
    await handleBillingEvent(event);
  }
}

/**
 * What a verified BillingEvent means for our own data — kept out of billing.routes.ts
 * on purpose, see AGENTS.md. Runs under `withSystemScope`, not `withOrgScope`: this is
 * webhook-triggered, already trusted via Stripe's signature (verified in
 * `processWebhook` before this ever runs), not a live user session with an
 * `organizationId` to scope to — `subscription_updated`/`subscription_canceled`
 * events don't even carry one, only a subscription id.
 */
async function handleBillingEvent(event: BillingEvent): Promise<void> {
  // Built up during the transaction, sent only after it commits — notifyUsers() opens
  // its own transaction internally (see notifications.service.ts's notifyUser), so
  // calling it *inside* this withSystemScope callback would nest a second transaction on
  // a separate pooled connection while this one is still open. That could commit a
  // notification for a billing change that this transaction later fails to commit.
  // Collecting NotifyInputs here and firing them after `withSystemScope` resolves keeps
  // the notification honest: it only ever reflects a billing update that actually landed.
  let pendingNotification: NotifyInput | null = null;

  await withSystemScope(async (tx) => {
    switch (event.type) {
      case "checkout_completed":
        if (event.ownerType === "organization") {
          await ensureBillingRow(tx, event.ownerId);
          await updateBillingByOrgId(tx, event.ownerId, {
            providerCustomerId: event.providerCustomerId,
            providerSubscriptionId: event.providerSubscriptionId,
            plan: event.planId,
            subscriptionStatus: "active",
          });
        } else {
          await ensureUserBillingRow(tx, event.ownerId);
          await updateUserBillingByUserId(tx, event.ownerId, {
            providerCustomerId: event.providerCustomerId,
            providerSubscriptionId: event.providerSubscriptionId,
            plan: event.planId,
            subscriptionStatus: "active",
          });
        }
        break;
      // These two event types only ever carry a subscription id, never which kind of
      // owner it belongs to (Stripe doesn't echo our checkout metadata back on
      // lifecycle events) — updating both tables by subscription id is safe and simple:
      // exactly one matches a row (subscription ids are unique per checkout, and each
      // checkout writes to exactly one table), the other is a harmless no-op.
      case "subscription_updated": {
        const [updatedOrg, updatedUser] = await Promise.all([
          updateBillingBySubscriptionId(tx, event.providerSubscriptionId, {
            subscriptionStatus: event.status,
            seatQuantity: event.seatQuantity,
          }),
          updateUserBillingBySubscriptionId(tx, event.providerSubscriptionId, {
            subscriptionStatus: event.status,
          }),
        ]);
        if (event.status === "past_due") {
          pendingNotification = await buildBillingIssueNotification(
            tx,
            updatedOrg,
            updatedUser,
            "past_due",
          );
        }
        break;
      }
      case "subscription_canceled": {
        const [updatedOrg, updatedUser] = await Promise.all([
          updateBillingBySubscriptionId(tx, event.providerSubscriptionId, {
            subscriptionStatus: "canceled",
          }),
          updateUserBillingBySubscriptionId(tx, event.providerSubscriptionId, {
            subscriptionStatus: "canceled",
          }),
        ]);
        pendingNotification = await buildBillingIssueNotification(
          tx,
          updatedOrg,
          updatedUser,
          "canceled",
        );
        break;
      }
    }
  });

  if (pendingNotification) {
    await notifyUsers(await getPlatformStaffUserIds(), pendingNotification);
  }
}

/**
 * Builds (but doesn't send) the staff notification for a payment problem — the only
 * audience with a reachable page to act on it today (apps/admin has no customer-facing
 * surface at all; see specs/notifications-plan.md's scope note). `updatedOrg`/
 * `updatedUser` are the `.returning()` results from the two update calls above — exactly
 * one is non-null, since a subscription id belongs to exactly one table (see the case
 * block's own comment on why both tables are updated unconditionally). The name lookups
 * below run on the still-open `tx` — plain reads, not a nested transaction.
 */
async function buildBillingIssueNotification(
  tx: DbExecutor,
  updatedOrg: { organizationId: string } | null,
  updatedUser: { userId: string } | null,
  status: "past_due" | "canceled",
): Promise<NotifyInput | null> {
  const statusLabel = status === "past_due" ? "Payment failed" : "Subscription canceled";

  if (updatedOrg) {
    const [org] = await tx
      .select({ name: organization.name })
      .from(organization)
      .where(eq(organization.id, updatedOrg.organizationId));
    const name = org?.name ?? updatedOrg.organizationId;
    return {
      title: `${statusLabel}: ${name}`,
      body: `The subscription for "${name}" is now ${status}.`,
      actionUrl: `/dashboard/organizations/${updatedOrg.organizationId}`,
    };
  }

  if (updatedUser) {
    const [account] = await tx
      .select({ name: user.name, email: user.email })
      .from(user)
      .where(eq(user.id, updatedUser.userId));
    const label = account?.name ?? account?.email ?? updatedUser.userId;
    return {
      title: `${statusLabel}: ${label}`,
      body: `The subscription for "${label}" is now ${status}.`,
      actionUrl: `/dashboard/individuals/${updatedUser.userId}`,
    };
  }

  return null;
}
