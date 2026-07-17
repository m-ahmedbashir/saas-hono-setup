import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext, requireOrgContext } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/permission.middleware";
import { success } from "../../lib/response";
import { checkoutRequestSchema } from "./billing.schema";
import { billingService } from "./stripe-billing.service";
import { processWebhook } from "./billing.handlers";

// zValidator's own failure response doesn't match our envelope, so the hook re-throws
// through AppError/app.onError instead — every failure still goes through one place.
const validateCheckoutBody = zValidator("json", checkoutRequestSchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid checkout request", flattenError(result.error));
  }
});

export const billingRoutes = new Hono()
  .post(
    "/checkout",
    injectUserContext,
    requirePermission({ billing: ["manage"] }),
    validateCheckoutBody,
    async (c) => {
      const userContext = requireOrgContext(
        c.get("userContext"),
        "Checkout requires an active organization",
      );
      const { planId, quantity } = c.req.valid("json");
      const { checkoutUrl } = await billingService.createCheckoutSession(
        userContext.organizationId,
        planId,
        quantity,
      );

      return success(c, { checkoutUrl });
    },
  )
  // Not wrapped in the success/failure envelope — Stripe only checks HTTP status on
  // this endpoint, never the body shape, same reasoning as /health and /api/auth's
  // envelope exclusion in AGENTS.md.
  .post("/webhook", async (c) => {
    const signature = c.req.header("stripe-signature");
    const payload = await c.req.text();
    await processWebhook(payload, signature);

    return c.json({ received: true });
  });
