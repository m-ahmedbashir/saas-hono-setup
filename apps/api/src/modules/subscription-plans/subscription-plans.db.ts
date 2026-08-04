import { subscriptionPlans, eq, ne, and, isNull, desc, type AnyExecutor } from "@repo/db";

// `subscriptionPlans` isn't RLS-enabled (global config, not owner-scoped data — see
// schema.ts's comment on the table), so every function here takes `AnyExecutor`
// (either the bare `db` client or an open transaction), never the stricter
// `DbExecutor` RLS-enabled tables require. See AGENTS.md's Row-Level Security section
// and `account.db.ts`'s identical reasoning for its own non-RLS tables.

export type OwnerType = "organization" | "individual";

export interface SubscriptionPlanFilters {
  ownerType?: OwnerType;
  isActive?: boolean;
}

export async function listSubscriptionPlans(tx: AnyExecutor, filters: SubscriptionPlanFilters) {
  const conditions = [];
  if (filters.ownerType) conditions.push(eq(subscriptionPlans.ownerType, filters.ownerType));
  if (filters.isActive !== undefined) {
    conditions.push(eq(subscriptionPlans.isActive, filters.isActive));
  }

  return tx
    .select()
    .from(subscriptionPlans)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(subscriptionPlans.createdAt));
}

export async function getSubscriptionPlanById(tx: AnyExecutor, id: string) {
  const [row] = await tx.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
  return row ?? null;
}

/**
 * Custom-then-shared resolution: an organization's own negotiated plan
 * (`organizationId` set) takes priority over a shared plan (`organizationId IS NULL`)
 * using the same `planId` slug — see specs/subscription-management-plan.md's
 * custom-plan design. Individual lookups always pass `organizationId: null` and go
 * straight to the shared branch (individuals never have a custom org-scoped plan).
 * This is what every billing-row plan lookup (entitlements, seat limit, checkout) goes
 * through — a billing row's `plan` string alone can't tell you which subscription_plans
 * row it means without also knowing the owning organization.
 */
export async function getSubscriptionPlanForBilling(
  tx: AnyExecutor,
  ownerType: OwnerType,
  planId: string,
  organizationId: string | null,
) {
  if (organizationId) {
    const [custom] = await tx
      .select()
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.ownerType, ownerType),
          eq(subscriptionPlans.planId, planId),
          eq(subscriptionPlans.organizationId, organizationId),
        ),
      );
    if (custom) return custom;
  }

  const [shared] = await tx
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.ownerType, ownerType),
        eq(subscriptionPlans.planId, planId),
        isNull(subscriptionPlans.organizationId),
      ),
    );
  return shared ?? null;
}

/** The current default shared plan for an `ownerType`, or `null` if none is flagged yet (shouldn't happen once seeded, but not assumed). */
export async function getDefaultSharedPlan(tx: AnyExecutor, ownerType: OwnerType) {
  const [row] = await tx
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.ownerType, ownerType),
        isNull(subscriptionPlans.organizationId),
        eq(subscriptionPlans.isDefault, true),
      ),
    );
  return row ?? null;
}

/**
 * Every active shared plan for an `ownerType`, excluding `excludeId` — backs the
 * "at least one active shared plan, including the default, must always exist" guard
 * (subscription-plans.service.ts): checks what would be left after a proposed
 * deactivation/un-default, not what exists right now.
 */
export async function listOtherActiveSharedPlans(
  tx: AnyExecutor,
  ownerType: OwnerType,
  excludeId: string,
) {
  return tx
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.ownerType, ownerType),
        isNull(subscriptionPlans.organizationId),
        eq(subscriptionPlans.isActive, true),
        ne(subscriptionPlans.id, excludeId),
      ),
    );
}

export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;
export type SubscriptionPlanRow = typeof subscriptionPlans.$inferSelect;
export type SubscriptionPlanUpdate = Partial<
  Omit<NewSubscriptionPlan, "id" | "ownerType" | "planId" | "organizationId" | "createdAt">
>;

export async function insertSubscriptionPlan(tx: AnyExecutor, values: NewSubscriptionPlan) {
  const [created] = await tx.insert(subscriptionPlans).values(values).returning();
  return created!;
}

export async function updateSubscriptionPlan(
  tx: AnyExecutor,
  id: string,
  values: SubscriptionPlanUpdate,
) {
  const [updated] = await tx
    .update(subscriptionPlans)
    .set(values)
    .where(eq(subscriptionPlans.id, id))
    .returning();
  return updated ?? null;
}

/** Unsets the current default for `ownerType`, other than `excludeId` — always called in the same transaction as the write that sets the new default (subscription-plans.service.ts), so the partial unique index never briefly sees two defaults. */
export async function clearOtherDefaults(tx: AnyExecutor, ownerType: OwnerType, excludeId: string) {
  await tx
    .update(subscriptionPlans)
    .set({ isDefault: false })
    .where(
      and(
        eq(subscriptionPlans.ownerType, ownerType),
        eq(subscriptionPlans.isDefault, true),
        ne(subscriptionPlans.id, excludeId),
      ),
    );
}
