import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext, requireOrgContext } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/permission.middleware";
import { success } from "../../lib/response";
import { checkoutRequestSchema, individualCheckoutRequestSchema } from "./billing.schema";
import { billingService } from "./stripe-billing.service";
import { processWebhook } from "./billing.handlers";

// zValidator's own failure response doesn't match our envelope, so the hook re-throws
// through AppError/app.onError instead — every failure still goes through one place.
const validateCheckoutBody = zValidator("json", checkoutRequestSchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid checkout request", flattenError(result.error));
  }
});

const validateIndividualCheckoutBody = zValidator(
  "json",
  individualCheckoutRequestSchema,
  (result) => {
    if (!result.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid individual checkout request",
        flattenError(result.error),
      );
    }
  },
);

export const billingRoutes = new Hono()
  .post(
    "/organization-checkout",
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
  // No requireOrgContext/requirePermission here on purpose — this is an individual's
  // own billing, an ownership concept (userContext.user.id), not an org-role one.
  // Works for both B2C and B2B2C sessions identically, since every session has a user.
  .post("/individual-checkout", injectUserContext, validateIndividualCheckoutBody, async (c) => {
    const userContext = c.get("userContext");
    const { planId } = c.req.valid("json");
    const { checkoutUrl } = await billingService.createIndividualCheckoutSession(
      userContext.user.id,
      planId,
    );

    return success(c, { checkoutUrl });
  })
  // Not wrapped in the success/failure envelope — Stripe only checks HTTP status on
  // this endpoint, never the body shape, same reasoning as /health and /api/auth's
  // envelope exclusion in AGENTS.md.
  .post("/webhook", async (c) => {
    const signature = c.req.header("stripe-signature");
    const payload = await c.req.text();
    await processWebhook(payload, signature);

    return c.json({ received: true });
  });
