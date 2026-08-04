import { AppError, type CheckoutSessionResult } from "@repo/core";
import { getPlanForBilling } from "../subscription-plans/subscription-plans.service";
import { billingService as stripeBillingService } from "./stripe-billing.service";

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
