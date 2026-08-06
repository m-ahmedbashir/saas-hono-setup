import { withOrgScope, withUserScope } from "@repo/db";
import { AppError, type CheckoutSessionResult } from "@repo/core";
import { getPlanForBilling } from "../subscription-plans/subscription-plans.service";
import { billingService as stripeBillingService } from "./stripe-billing.service";
import { ensureBillingRow, getBillingByOrgId } from "./organization-billing.db";
import { ensureUserBillingRow, getUserBillingByUserId } from "./individual-billing.db";

// Multi-step business logic (resolve plan → validate it → call the vendor), pulled out
// of billing.controller.ts per AGENTS.md's controller discipline rule. This is the only
// file that imports both the subscription-plans module and stripe-billing.service.ts —
// keeping that dependency one-directional (this module depends on both, neither of
// those depends back on this one) is what avoids a circular import between them.
async function resolveActivePlanPrice(
  ownerType: "organization" | "individual",
  planId: string,
  organizationId: string | null,
): Promise<string> {
  const plan = await getPlanForBilling(ownerType, planId, organizationId);
  if (!plan) {
    throw new AppError("VALIDATION_ERROR", `Plan "${planId}" does not exist`);
  }
  if (!plan.isActive) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Plan "${planId}" is no longer available for new checkouts`,
    );
  }
  if (!plan.providerPriceId) {
    throw new AppError("VALIDATION_ERROR", `Plan "${planId}" has no billable price configured`);
  }
  return plan.providerPriceId;
}

export async function createOrganizationCheckout(
  orgId: string,
  planId: string,
  quantity: number,
  idempotencyKey?: string,
): Promise<CheckoutSessionResult> {
  const providerPriceId = await resolveActivePlanPrice("organization", planId, orgId);
  return stripeBillingService.createCheckoutSession(
    orgId,
    planId,
    providerPriceId,
    quantity,
    idempotencyKey,
  );
}

export async function createIndividualCheckout(
  userId: string,
  planId: string,
  idempotencyKey?: string,
): Promise<CheckoutSessionResult> {
  const providerPriceId = await resolveActivePlanPrice("individual", planId, null);
  return stripeBillingService.createIndividualCheckoutSession(
    userId,
    planId,
    providerPriceId,
    idempotencyKey,
  );
}

export interface OrganizationBillingView {
  plan: string;
  subscriptionStatus: string | null;
  seatQuantity: number | null;
}

// Never returns a raw `db.select()` row (AGENTS.md's Data shaping rule) — only the three
// fields a self-service view actually needs, not `providerCustomerId`/
// `providerSubscriptionId` (internal Stripe ids with no reason to leave the backend).
// `ensureBillingRow`, not `getBillingByOrgId` — an org with no billing row yet (never
// checked out) still gets a real response (defaults to the free plan), not a 404, same
// as how entitlement/seat-limit middleware already treat a missing row.
export async function getOrganizationBillingView(
  organizationId: string,
): Promise<OrganizationBillingView> {
  const row = await withOrgScope(organizationId, (tx) => ensureBillingRow(tx, organizationId));
  return {
    plan: row.plan,
    subscriptionStatus: row.subscriptionStatus,
    seatQuantity: row.seatQuantity,
  };
}

export interface IndividualBillingView {
  plan: string;
  subscriptionStatus: string | null;
}

export async function getIndividualBillingView(userId: string): Promise<IndividualBillingView> {
  const row = await withUserScope(userId, (tx) => ensureUserBillingRow(tx, userId));
  return { plan: row.plan, subscriptionStatus: row.subscriptionStatus };
}

/**
 * Cancels via Stripe only — deliberately does NOT write `subscriptionStatus` on the
 * local row directly, and does NOT insert into `billing_events` (that ledger records
 * real inbound Stripe events, keyed on a real `stripeEventId`; a user-initiated action
 * has neither). Stripe's own `customer.subscription.deleted`/`.updated` webhook — the
 * same one every other lifecycle change already flows through — is left as the single
 * writer of local subscription state, guarded by the existing out-of-order protection
 * (specs/billing-integrity-plan.md's Fix 3). Same "call the gateway, let the webhook be
 * the source of truth" shape as `account.service.ts`'s subscription cancellation during
 * account deletion. A brief window where the row still reads "active" until that webhook
 * lands is expected and self-corrects, not a bug to work around here.
 */
export async function cancelOrganizationSubscription(organizationId: string): Promise<void> {
  const row = await withOrgScope(organizationId, (tx) => getBillingByOrgId(tx, organizationId));
  if (!row?.providerSubscriptionId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "This organization has no active subscription to cancel",
    );
  }
  await stripeBillingService.cancelSubscription(row.providerSubscriptionId);
}

/** Mirrors cancelOrganizationSubscription exactly — see its comment. */
export async function cancelIndividualSubscription(userId: string): Promise<void> {
  const row = await withUserScope(userId, (tx) => getUserBillingByUserId(tx, userId));
  if (!row?.providerSubscriptionId) {
    throw new AppError("VALIDATION_ERROR", "You have no active subscription to cancel");
  }
  await stripeBillingService.cancelSubscription(row.providerSubscriptionId);
}
