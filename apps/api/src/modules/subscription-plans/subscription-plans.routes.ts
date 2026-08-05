import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePlatformPermission } from "../../middleware/platform-permission.middleware";
import {
  listSubscriptionPlansQuerySchema,
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
} from "./subscription-plans.schema";
import {
  listSubscriptionPlansHandler,
  getSubscriptionPlanHandler,
  createSubscriptionPlanHandler,
  updateSubscriptionPlanHandler,
} from "./subscription-plans.controller";

// Same re-throw-through-AppError pattern as every other validated route in this repo.
const validateListQuery = zValidator("query", listSubscriptionPlansQuerySchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", flattenError(result.error));
  }
});

const validateCreateBody = zValidator("json", createSubscriptionPlanSchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid subscription plan", flattenError(result.error));
  }
});

const validateUpdateBody = zValidator("json", updateSubscriptionPlanSchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid subscription plan", flattenError(result.error));
  }
});

// Platform-wide config, not org-scoped — no requireOrgContext, same reasoning as
// platform-organizations/platform-individuals. `list` (read) is granted to both admin
// and support (same read-only-tier pattern as the rest of platform admin); `manage`
// (create/update) is admin-only. GET routes here are the admin UI's only consumer —
// internal entitlement/checkout resolution never goes through this HTTP route, it
// calls subscription-plans.service.ts directly (see
// specs/subscription-management-plan.md's "Internal resolution never goes through the
// HTTP route"). No DELETE route — see the spec's "No hard delete".
export const subscriptionPlansRoutes = new Hono()
  .get(
    "/",
    injectUserContext,
    requirePlatformPermission({ subscriptionPlans: ["list"] }),
    validateListQuery,
    listSubscriptionPlansHandler,
  )
  .get(
    "/:id",
    injectUserContext,
    requirePlatformPermission({ subscriptionPlans: ["list"] }),
    getSubscriptionPlanHandler,
  )
  .post(
    "/",
    injectUserContext,
    requirePlatformPermission({ subscriptionPlans: ["manage"] }),
    validateCreateBody,
    createSubscriptionPlanHandler,
  )
  .patch(
    "/:id",
    injectUserContext,
    requirePlatformPermission({ subscriptionPlans: ["manage"] }),
    validateUpdateBody,
    updateSubscriptionPlanHandler,
  );
