import { withSystemScope } from "@repo/db";
import { AppError, type BillingEvent } from "@repo/core";
import { billingService } from "./stripe-billing.service";
import {
  ensureBillingRow,
  updateBillingByOrgId,
  updateBillingBySubscriptionId,
} from "./billing.db";

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
  await withSystemScope(async (tx) => {
    switch (event.type) {
      case "checkout_completed":
        await ensureBillingRow(tx, event.orgId);
        await updateBillingByOrgId(tx, event.orgId, {
          providerCustomerId: event.providerCustomerId,
          providerSubscriptionId: event.providerSubscriptionId,
          plan: event.planId,
          subscriptionStatus: "active",
        });
        break;
      case "subscription_updated":
        await updateBillingBySubscriptionId(tx, event.providerSubscriptionId, {
          subscriptionStatus: event.status,
          seatQuantity: event.seatQuantity,
        });
        break;
      case "subscription_canceled":
        await updateBillingBySubscriptionId(tx, event.providerSubscriptionId, {
          subscriptionStatus: "canceled",
        });
        break;
    }
  });
}
