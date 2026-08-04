import { createMiddleware } from "hono/factory";
import { member, eq, count, withOrgScope } from "@repo/db";
import { AppError } from "@repo/core";
import { getBillingByOrgId } from "../modules/billing/organization-billing.db";
import {
  getPlanForBilling,
  getDefaultPlanId,
} from "../modules/subscription-plans/subscription-plans.service";

/**
 * Blocks an org-scoped action once active member count reaches the org's
 * plan seat limit. Requires `injectUserContext` to have run first. B2C
 * passes through — seat limits are an org concept, same reasoning as
 * `requirePermission`'s B2C bypass.
 */
export const enforceSeatLimit = createMiddleware(async (c, next) => {
  const userContext = c.get("userContext");

  if (!userContext) {
    throw new AppError(
      "INTERNAL_ERROR",
      "enforceSeatLimit used without injectUserContext running first",
    );
  }

  if (userContext.mode !== "B2B2C") {
    await next();
    return;
  }

  const organizationId = userContext.organizationId;
  const { existingPlanId, activeMembers } = await withOrgScope(organizationId, async (tx) => {
    const billingRow = await getBillingByOrgId(tx, organizationId);
    const [row] = await tx
      .select({ activeMembers: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId));

    return {
      existingPlanId: billingRow?.plan,
      activeMembers: row?.activeMembers ?? 0,
    };
  });
  const planId = existingPlanId ?? (await getDefaultPlanId("organization"));

  // A plan that can't be resolved at all gets the same conservative default as
  // fallbackEntitlements' deny-most philosophy (entitlements.ts) — 0 seats, fail
  // closed, rather than silently letting an unbounded number of members in.
  const plan = await getPlanForBilling("organization", planId, organizationId);
  const seatLimit = plan?.seatLimit ?? 0;

  if (activeMembers >= seatLimit) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Seat limit reached for the "${planId}" plan (${seatLimit} seats)`,
    );
  }

  await next();
});
