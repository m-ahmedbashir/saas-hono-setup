import { individualBilling, eq, count, type DbExecutor } from "@repo/db";
import type { IndividualPlanId, SubscriptionStatus } from "@repo/core";

// Mirrors organization-billing.db.ts exactly, scoped by userId instead of
// organizationId — see its header comment and AGENTS.md's Row-Level Security
// section for why `tx` is required.

export async function getUserBillingByUserId(tx: DbExecutor, userId: string) {
  const [row] = await tx
    .select()
    .from(individualBilling)
    .where(eq(individualBilling.userId, userId));
  return row ?? null;
}

/** Creates the row with defaults (individual free plan) if the user doesn't have one yet — every user gets exactly one. */
export async function ensureUserBillingRow(tx: DbExecutor, userId: string) {
  const existing = await getUserBillingByUserId(tx, userId);
  if (existing) return existing;

  const [created] = await tx
    .insert(individualBilling)
    .values({ id: crypto.randomUUID(), userId })
    .returning();
  return created!;
}

interface UserBillingUpdate {
  plan: IndividualPlanId;
  providerCustomerId: string;
  providerSubscriptionId: string;
  subscriptionStatus: SubscriptionStatus;
}

export async function updateUserBillingByUserId(
  tx: DbExecutor,
  userId: string,
  values: Partial<UserBillingUpdate>,
) {
  await tx.update(individualBilling).set(values).where(eq(individualBilling.userId, userId));
}

/** Same reasoning as organization-billing.db.ts's identical change — returns the updated row (or `null`) so the caller can tell whether this table was the match. */
export async function updateUserBillingBySubscriptionId(
  tx: DbExecutor,
  providerSubscriptionId: string,
  values: Partial<UserBillingUpdate>,
) {
  const [updated] = await tx
    .update(individualBilling)
    .set(values)
    .where(eq(individualBilling.providerSubscriptionId, providerSubscriptionId))
    .returning();
  return updated ?? null;
}

/** Mirrors organization-billing.db.ts's countByPlan exactly — see its comment. */
export async function countByPlan(tx: DbExecutor, plan: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(individualBilling)
    .where(eq(individualBilling.plan, plan));
  return row?.value ?? 0;
}
