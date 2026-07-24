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
  // Not wrapped in the success/failure envelope — Stripe only checks HTTP status on
  // this endpoint, never the body shape, same reasoning as /health and /api/auth's
  // envelope exclusion in AGENTS.md.
  .post("/webhook", webhookRequestHandler);
