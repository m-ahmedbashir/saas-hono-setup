import { Hono } from "hono";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/permission.middleware";
import { success } from "../../lib/response";
import { checkoutRequestSchema } from "./billing.schema";
import { billingService } from "./stripe-billing.service";
import { ensureBillingRow, updateBillingByOrgId, updateBillingBySubscriptionId } from "./billing.db";

export const billingRoutes = new Hono()
  .post("/checkout", injectUserContext, requirePermission({ billing: ["manage"] }), async (c) => {
    const userContext = c.get("userContext");
    if (userContext.mode !== "B2B2C") {
      throw new AppError("VALIDATION_ERROR", "Checkout requires an active organization");
    }

    const body = await c.req.json().catch(() => null);
    const parsed = checkoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new AppError("VALIDATION_ERROR", "Invalid checkout request", parsed.error.flatten());
    }

    const { checkoutUrl } = await billingService.createCheckoutSession(
      userContext.organizationId,
      parsed.data.planId,
      parsed.data.quantity
    );

    return success(c, { checkoutUrl });
  })
  // Not wrapped in the success/failure envelope — Stripe only checks HTTP status on
  // this endpoint, never the body shape, same reasoning as /health and /api/auth's
  // envelope exclusion in AGENTS.md.
  .post("/webhook", async (c) => {
    const signature = c.req.header("stripe-signature");
    if (!signature) {
      throw new AppError("VALIDATION_ERROR", "Missing Stripe webhook signature");
    }

    const payload = await c.req.text();
    const event = billingService.parseWebhookEvent(payload, signature);

    if (event) {
      switch (event.type) {
        case "checkout_completed":
          await ensureBillingRow(event.orgId);
          await updateBillingByOrgId(event.orgId, {
            providerCustomerId: event.providerCustomerId,
            providerSubscriptionId: event.providerSubscriptionId,
            plan: event.planId,
            subscriptionStatus: "active",
          });
          break;
        case "subscription_updated":
          await updateBillingBySubscriptionId(event.providerSubscriptionId, {
            subscriptionStatus: event.status,
            seatQuantity: event.seatQuantity,
          });
          break;
        case "subscription_canceled":
          await updateBillingBySubscriptionId(event.providerSubscriptionId, {
            subscriptionStatus: "canceled",
          });
          break;
      }
    }

    return c.json({ received: true });
  });
