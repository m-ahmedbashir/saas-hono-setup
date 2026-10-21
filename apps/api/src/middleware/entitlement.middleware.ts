import { createMiddleware } from "hono/factory";
import { withOrgScope, withUserScope } from "@repo/db";
import { AppError, canAccessFeature, type FeatureKey } from "@repo/core";
import { requireOrgContext } from "./auth.middleware";
import { getBillingByOrgId } from "../modules/billing/organization-billing.db";
import { getUserBillingByUserId } from "../modules/billing/individual-billing.db";
import {
  resolveEntitlementsForPlan,
  currentPlanId,
} from "../modules/subscription-plans/subscription-plans.service";

/**
 * The one entitlement gate for the whole app, for either billing universe — see
 * AGENTS.md's Feature Entitlements section. Requires `injectUserContext` to have run
 * first, same precondition as `requirePermission`.
 *
 * `scope` is required, not inferred from `userContext.mode`: a B2B2C session having an
 * active organization doesn't mean every route it hits is an org-level feature (e.g. a
 * personal settings screen). Inferring scope from session state would silently check the
 * wrong plan's entitlements for a route like that — the route author declares which
 * billing entity gates it instead, closing off that whole class of mistake.
 */
export const requireFeature = (feature: FeatureKey, scope: "organization" | "individual") =>
  createMiddleware(async (c, next) => {
    const userContext = c.get("userContext");

    if (!userContext) {
      throw new AppError(
        "INTERNAL_ERROR",
        "requireFeature used without injectUserContext running first",
      );
    }

    const allowed =
      scope === "organization"
        ? await organizationHasFeature(requireOrgContext(userContext).organizationId, feature)
        : await individualHasFeature(userContext.user.id, feature);

    if (!allowed) {
      throw new AppError(
        "PAYMENT_REQUIRED",
        `Your current plan does not include "${feature}" — an upgrade is required`,
      );
    }

    await next();
  });

async function organizationHasFeature(
  organizationId: string,
  feature: FeatureKey,
): Promise<boolean> {
  const row = await withOrgScope(organizationId, (tx) => getBillingByOrgId(tx, organizationId));
  const planId = await currentPlanId("organization", row);
  const entitlements = await resolveEntitlementsForPlan("organization", planId, organizationId);
  return canAccessFeature(entitlements, feature);
}

async function individualHasFeature(userId: string, feature: FeatureKey): Promise<boolean> {
  const row = await withUserScope(userId, (tx) => getUserBillingByUserId(tx, userId));
  const planId = await currentPlanId("individual", row);
  const entitlements = await resolveEntitlementsForPlan("individual", planId, null);
  return canAccessFeature(entitlements, feature);
}
