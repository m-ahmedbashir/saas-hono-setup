import { withSystemScope, organization, user, eq, type DbExecutor } from "@repo/db";
import { AppError, type BillingEvent } from "@repo/core";
import { billingService } from "./stripe-billing.service";
import {
  ensureBillingRow,
  updateBillingByOrgId,
  updateBillingBySubscriptionId,
  getBillingBySubscriptionId,
} from "./organization-billing.db";
import {
  ensureUserBillingRow,
  updateUserBillingByUserId,
  updateUserBillingBySubscriptionId,
  getUserBillingBySubscriptionId,
} from "./individual-billing.db";
import { insertBillingEvent } from "./billing-events.db";
import { insertInvoice, markInvoiceRefunded } from "./invoices.db";
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

interface ResolvedOwner {
  ownerType: "organization" | "individual";
  ownerId: string;
  planId: string;
}

/**
 * Read-only — resolves which table a subscription id belongs to, without mutating
 * anything (unlike `updateBillingBySubscriptionId`/`updateUserBillingBySubscriptionId`,
 * which apply a real, order-guarded write). Used both for `billing_events`' `ownerType`/
 * `ownerId` columns and for `invoice_paid`'s `invoices` row — see their call sites below
 * for why each needs a *read*, not the update path.
 */
async function resolveOwnerBySubscriptionId(
  tx: DbExecutor,
  providerSubscriptionId: string,
): Promise<ResolvedOwner | null> {
  const orgRow = await getBillingBySubscriptionId(tx, providerSubscriptionId);
  if (orgRow) {
    return { ownerType: "organization", ownerId: orgRow.organizationId, planId: orgRow.plan };
  }
  const userRow = await getUserBillingBySubscriptionId(tx, providerSubscriptionId);
  if (userRow) {
    return { ownerType: "individual", ownerId: userRow.userId, planId: userRow.plan };
  }
  return null;
}

/**
 * What a verified BillingEvent means for our own data — kept out of billing.routes.ts
 * on purpose, see AGENTS.md. Runs under `withSystemScope`, not `withOrgScope`: this is
 * webhook-triggered, already trusted via Stripe's signature (verified in
 * `processWebhook` before this ever runs), not a live user session with an
 * `organizationId` to scope to — `subscription_updated`/`subscription_canceled`
 * events don't even carry one, only a subscription id.
 *
 * See specs/billing-integrity-plan.md for the full design this implements: an
 * append-only `billing_events` ledger (inbound idempotency + audit trail), a curated
 * `invoices` table (the receipt/order record), and the two ordering/race guards below
 * (Fix 3, Fix 4).
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
    // Fix 1 (inbound idempotency): resolve owner info *before* inserting — billing_events
    // can never be UPDATEd afterward to backfill it once written (see the table's
    // REVOKE), so whatever we know now is all it will ever have. Best-effort/nullable for
    // event types with no cheap lookup (charge_refunded/charge_dispute_created key off a
    // payment intent id, not a subscription id) — see BillingEvent's doc comment.
    const owner =
      event.type === "checkout_completed"
        ? { ownerType: event.ownerType, ownerId: event.ownerId, planId: event.planId }
        : event.type === "subscription_updated" ||
            event.type === "subscription_canceled" ||
            event.type === "invoice_paid" ||
            event.type === "invoice_payment_failed"
          ? await resolveOwnerBySubscriptionId(tx, event.providerSubscriptionId)
          : null;

    const inserted = await insertBillingEvent(tx, {
      id: crypto.randomUUID(),
      stripeEventId: event.stripeEventId,
      type: event.type,
      ownerType: owner?.ownerType ?? null,
      ownerId: owner?.ownerId ?? null,
      eventCreatedAt: event.eventCreatedAt,
      payload: event.rawPayload,
    });
    // Duplicate delivery of an event we've already recorded — the unique constraint on
    // stripeEventId caught it. Everything below only ever needs to happen once per real
    // event, so stop here rather than reprocessing (and, for subscription_updated in
    // particular, re-firing a staff notification that already went out).
    if (!inserted) return;

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
      // checkout writes to exactly one table), the other is a harmless no-op. Both calls
      // now also pass `event.eventCreatedAt` (Fix 3) — an out-of-order retry of an older
      // event matches zero rows instead of overwriting a row a newer event already
      // corrected.
      case "subscription_updated": {
        const [updatedOrg, updatedUser] = await Promise.all([
          updateBillingBySubscriptionId(tx, event.providerSubscriptionId, event.eventCreatedAt, {
            subscriptionStatus: event.status,
            seatQuantity: event.seatQuantity,
          }),
          updateUserBillingBySubscriptionId(
            tx,
            event.providerSubscriptionId,
            event.eventCreatedAt,
            { subscriptionStatus: event.status },
          ),
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
          updateBillingBySubscriptionId(tx, event.providerSubscriptionId, event.eventCreatedAt, {
            subscriptionStatus: "canceled",
          }),
          updateUserBillingBySubscriptionId(
            tx,
            event.providerSubscriptionId,
            event.eventCreatedAt,
            { subscriptionStatus: "canceled" },
          ),
        ]);
        pendingNotification = await buildBillingIssueNotification(
          tx,
          updatedOrg,
          updatedUser,
          "canceled",
        );
        break;
      }
      case "invoice_paid": {
        // `owner` was already resolved above for the ledger row — reused here rather
        // than looked up twice. Missing is the same class of race Fix 4 guards against
        // (a dependent event arriving before the one it depends on: here, invoice.paid
        // before this app has finished recording the checkout that created the
        // subscription in the first place) — throwing lets Stripe's own retry schedule
        // redeliver once the billing row exists, instead of silently dropping the invoice.
        if (!owner) {
          throw new AppError(
            "INTERNAL_ERROR",
            `No billing row found for subscription ${event.providerSubscriptionId} — invoice.paid arrived before its checkout_completed was recorded`,
          );
        }
        await insertInvoice(tx, {
          id: crypto.randomUUID(),
          ownerType: owner.ownerType,
          organizationId: owner.ownerType === "organization" ? owner.ownerId : null,
          userId: owner.ownerType === "individual" ? owner.ownerId : null,
          planId: owner.planId,
          amountTotal: event.amountTotal,
          currency: event.currency,
          stripeInvoiceId: event.stripeInvoiceId,
          stripePaymentIntentId: event.paymentIntentId,
          providerSubscriptionId: event.providerSubscriptionId,
          receiptUrl: event.receiptUrl,
          issuedAt: event.eventCreatedAt,
        });
        break;
      }
      case "charge_refunded":
        // Fix 4: throws (doesn't swallow) if no matching `invoices` row exists yet —
        // see markInvoiceRefunded's own doc comment for the full reasoning. Logged at
        // warn, not left to propagate as an unlabeled exception, so this expected,
        // self-healing condition doesn't read as a production incident in error
        // reporting (apps/api/src/instrument.ts has real Sentry wired in).
        try {
          await markInvoiceRefunded(tx, event.paymentIntentId);
        } catch (err) {
          console.warn(
            `billing: charge.refunded (payment_intent=${event.paymentIntentId}) arrived before its invoice — will retry`,
          );
          throw err;
        }
        break;
      case "invoice_payment_failed":
      case "charge_dispute_created":
        // Recorded in billing_events above, unconditionally — reacting further (e.g. a
        // dedicated "refund/dispute" notification) is a separate, later decision per
        // event type, not bundled into this pass. See specs/billing-integrity-plan.md.
        break;
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
