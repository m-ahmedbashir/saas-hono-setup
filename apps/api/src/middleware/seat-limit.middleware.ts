import { createMiddleware } from "hono/factory";
import { member, eq, count, withOrgScope } from "@repo/db";
import { AppError, plans, type PlanId } from "@repo/core";
import { getBillingByOrgId } from "../modules/billing/organization-billing.db";

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
  const { planId, activeMembers } = await withOrgScope(organizationId, async (tx) => {
    const billingRow = await getBillingByOrgId(tx, organizationId);
    const [row] = await tx
      .select({ activeMembers: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId));

    return {
      planId: (billingRow?.plan as PlanId | undefined) ?? "free",
      activeMembers: row?.activeMembers ?? 0,
    };
  });
  const seatLimit = plans[planId].seatLimit;

  if (activeMembers >= seatLimit) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Seat limit reached for the "${planId}" plan (${seatLimit} seats)`,
    );
  }

  await next();
});
