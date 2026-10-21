import { withOrgScope, withUserScope } from "@repo/db";
import {
  AppError,
  isLiveSubscription,
  type CheckoutSessionResult,
  type SubscriptionStatus,
} from "@repo/core";
import {
  getPlanForBilling,
  listPlanOptions,
  type PlanOptionRow,
} from "../subscription-plans/subscription-plans.service";
import { countOrganizationMembers } from "../organization/organization.db";
import { billingService as stripeBillingService } from "./stripe-billing.service";
import { ensureBillingRow, getBillingByOrgId } from "./organization-billing.db";
import { ensureUserBillingRow, getUserBillingByUserId } from "./individual-billing.db";

// Multi-step business logic (resolve plan → validate it → call the vendor), pulled out
// of billing.controller.ts per AGENTS.md's controller discipline rule. This is the only
// file that imports both the subscription-plans module and stripe-billing.service.ts —
// keeping that dependency one-directional (this module depends on both, neither of
// those depends back on this one) is what avoids a circular import between them.
async function resolvePurchasablePlan(
  ownerType: "organization" | "individual",
  planId: string,
  organizationId: string | null,
): Promise<{ providerPriceId: string; seatLimit: number | null }> {
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
  return { providerPriceId: plan.providerPriceId, seatLimit: plan.seatLimit };
}

/**
 * Checkout always creates a *new* Stripe subscription — it can't change an existing one.
 * So while one is live, a second checkout would bill the customer twice, and its webhook
 * would overwrite the row's providerSubscriptionId, leaving the first subscription
 * unreachable from self-service cancel. Switching plans means canceling first (or a
 * future plan-change flow that updates the existing subscription in place).
 */
function assertNoLiveSubscription(status: SubscriptionStatus | null, message: string) {
  if (isLiveSubscription(status)) {
    throw new AppError("VALIDATION_ERROR", message);
  }
}

// Seat-based billing: paying for fewer seats than the org already has members under-bills
// it, and more than the plan's member limit pays for seats enforceSeatLimit will never let
// it fill. apps/portal's form checks the same bounds for UX; this is the authority.
function assertSeatQuantity(quantity: number, memberCount: number, seatLimit: number | null) {
  if (quantity < memberCount) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Choose at least ${memberCount} seats — this organization has ${memberCount} members`,
    );
  }
  if (seatLimit !== null && quantity > seatLimit) {
    throw new AppError("VALIDATION_ERROR", `This plan allows at most ${seatLimit} seats`);
  }
}

export async function createOrganizationCheckout(
  orgId: string,
  planId: string,
  quantity: number,
  idempotencyKey?: string,
): Promise<CheckoutSessionResult> {
  const { status, memberCount } = await withOrgScope(orgId, async (tx) => ({
    status: statusOf(await getBillingByOrgId(tx, orgId)),
    memberCount: await countOrganizationMembers(tx, orgId),
  }));
  assertNoLiveSubscription(
    status,
    "This organization already has an active subscription — cancel it before choosing a new plan",
  );
  const plan = await resolvePurchasablePlan("organization", planId, orgId);
  assertSeatQuantity(quantity, memberCount, plan.seatLimit);

  return stripeBillingService.createCheckoutSession(
    orgId,
    planId,
    plan.providerPriceId,
    quantity,
    idempotencyKey,
  );
}

export async function createIndividualCheckout(
  userId: string,
  planId: string,
  idempotencyKey?: string,
): Promise<CheckoutSessionResult> {
  const status = await withUserScope(userId, async (tx) =>
    statusOf(await getUserBillingByUserId(tx, userId)),
  );
  assertNoLiveSubscription(
    status,
    "You already have an active subscription — cancel it before choosing a new plan",
  );
  const plan = await resolvePurchasablePlan("individual", planId, null);

  return stripeBillingService.createIndividualCheckoutSession(
    userId,
    planId,
    plan.providerPriceId,
    idempotencyKey,
  );
}

// subscription_status is plain text in packages/db (which can't import @repo/core's
// union), but only ever written from mapStripeStatus's output — this is the one place
// it's narrowed back, rather than a cast at every read.
function statusOf(row: { subscriptionStatus: string | null } | null): SubscriptionStatus | null {
  return (row?.subscriptionStatus as SubscriptionStatus | null | undefined) ?? null;
}

export interface OrganizationBillingView {
  plan: string;
  subscriptionStatus: SubscriptionStatus | null;
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
    subscriptionStatus: statusOf(row),
    seatQuantity: row.seatQuantity,
  };
}

export interface IndividualBillingView {
  plan: string;
  subscriptionStatus: SubscriptionStatus | null;
}

export async function getIndividualBillingView(userId: string): Promise<IndividualBillingView> {
  const row = await withUserScope(userId, (tx) => ensureUserBillingRow(tx, userId));
  return { plan: row.plan, subscriptionStatus: statusOf(row) };
}

// The customer-facing projection of the plan catalog — `/subscription-plans` itself is
// platform-staff-only. `isPurchasable` stands in for `providerPriceId` (an internal
// Stripe id, same no-leave-the-backend reasoning as the billing views above): a plan with
// no price (the free tier, or a deal handled offline) can be shown but not checked out.
export interface OrganizationPlanOption {
  planId: string;
  name: string;
  description: string | null;
  seatLimit: number | null;
  isPurchasable: boolean;
}

// No `seatLimit` — individual billing has no seat concept (ISP, same as
// individualCheckoutRequestSchema having no `quantity`).
export type IndividualPlanOption = Omit<OrganizationPlanOption, "seatLimit">;

// The one projection from a catalog row to what a customer sees — including the one
// definition of "purchasable" — shared by both scopes so they can't drift apart.
function toPlanOption(row: PlanOptionRow): OrganizationPlanOption {
  return {
    planId: row.planId,
    name: row.name,
    description: row.description,
    seatLimit: row.seatLimit,
    isPurchasable: row.providerPriceId !== null,
  };
}

export async function getOrganizationPlanOptions(
  organizationId: string,
): Promise<{ plans: OrganizationPlanOption[] }> {
  const rows = await listPlanOptions("organization", organizationId);
  return { plans: rows.map(toPlanOption) };
}

export async function getIndividualPlanOptions(): Promise<{ plans: IndividualPlanOption[] }> {
  const rows = await listPlanOptions("individual", null);
  return { plans: rows.map((row) => withoutSeatLimit(toPlanOption(row))) };
}

function withoutSeatLimit({ seatLimit: _seatLimit, ...option }: OrganizationPlanOption) {
  return option;
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
 *
 * The subscription id alone doesn't mean there's something to cancel: it stays on the row
 * after the subscription ends (so late events for it still resolve to their owner), so
 * liveness comes from the status, same `isLiveSubscription` rule as checkout.
 */
export async function cancelOrganizationSubscription(organizationId: string): Promise<void> {
  const row = await withOrgScope(organizationId, (tx) => getBillingByOrgId(tx, organizationId));
  if (!row?.providerSubscriptionId || !isLiveSubscription(statusOf(row))) {
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
  if (!row?.providerSubscriptionId || !isLiveSubscription(statusOf(row))) {
    throw new AppError("VALIDATION_ERROR", "You have no active subscription to cancel");
  }
  await stripeBillingService.cancelSubscription(row.providerSubscriptionId);
}
