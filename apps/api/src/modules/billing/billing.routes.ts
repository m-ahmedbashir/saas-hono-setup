import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/permission.middleware";
import { checkoutRequestSchema, individualCheckoutRequestSchema } from "./billing.schema";
import {
  organizationCheckoutHandler,
  individualCheckoutHandler,
  getOrganizationBillingHandler,
  getIndividualBillingHandler,
  cancelOrganizationBillingHandler,
  cancelIndividualBillingHandler,
  webhookRequestHandler,
} from "./billing.controller";

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
    organizationCheckoutHandler,
  )
  // No requireOrgContext/requirePermission here on purpose — this is an individual's
  // own billing, an ownership concept (userContext.user.id), not an org-role one.
  // Works for both B2C and B2B2C sessions identically, since every session has a user.
  .post(
    "/individual-checkout",
    injectUserContext,
    validateIndividualCheckoutBody,
    individualCheckoutHandler,
  )
  // Any active-org member can view — read-only org-shared info, same reasoning as
  // GET /organization-profile, not a role-gated action.
  .get("/organization", injectUserContext, getOrganizationBillingHandler)
  // Ownership-based, same reasoning as /individual-checkout above.
  .get("/individual", injectUserContext, getIndividualBillingHandler)
  // Owner/admin only, same permission as organization-checkout — canceling the org's
  // subscription is exactly as sensitive as starting one.
  .post(
    "/organization-cancel",
    injectUserContext,
    requirePermission({ billing: ["manage"] }),
    cancelOrganizationBillingHandler,
  )
  // Ownership-based, same reasoning as /individual-checkout above.
  .post("/individual-cancel", injectUserContext, cancelIndividualBillingHandler)
  // Not wrapped in the success/failure envelope — Stripe only checks HTTP status on
  // this endpoint, never the body shape, same reasoning as /health and /api/auth's
  // envelope exclusion in AGENTS.md.
  .post("/webhook", webhookRequestHandler);
