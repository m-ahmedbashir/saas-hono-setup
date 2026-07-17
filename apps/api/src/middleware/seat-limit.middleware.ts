import { createMiddleware } from "hono/factory";
import { db, member, eq, count } from "@repo/db";
import { AppError, plans, type PlanId } from "@repo/core";
import { getBillingByOrgId } from "../modules/billing/billing.db";

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

  const billingRow = await getBillingByOrgId(userContext.organizationId);
  const planId: PlanId = (billingRow?.plan as PlanId | undefined) ?? "free";
  const seatLimit = plans[planId].seatLimit;

  const [row] = await db
    .select({ activeMembers: count() })
    .from(member)
    .where(eq(member.organizationId, userContext.organizationId));

  if ((row?.activeMembers ?? 0) >= seatLimit) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      `Seat limit reached for the "${planId}" plan (${seatLimit} seats)`,
    );
  }

  await next();
});
