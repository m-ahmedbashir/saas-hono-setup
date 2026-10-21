import { subscriptionPlans, eq, ne, and, or, isNull, asc, desc, type AnyExecutor } from "@repo/db";

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

// Which plans a scope can see at all: every shared plan, plus — for an organization —
// that one org's own custom plans. Never another org's.
function visibleToScope(organizationId: string | null) {
  return organizationId
    ? or(
        isNull(subscriptionPlans.organizationId),
        eq(subscriptionPlans.organizationId, organizationId),
      )
    : isNull(subscriptionPlans.organizationId);
}

/**
 * The custom-then-shared precedence rule, defined once for every caller — the single
 * plan lookup behind entitlements/seat limits/checkout (`getSubscriptionPlanForBilling`)
 * and the customer-facing plan list (`listPlanOptions`) both go through it, so they can
 * never disagree about which row a slug means for an org. An org's custom plan replaces
 * the shared plan with the same `planId` **whether or not the custom one is active**: a
 * retired deal must keep resolving for the org's existing subscribers (their entitlements
 * don't silently switch to the shared plan's), and so the shared plan isn't offered to
 * that org either — checkout would resolve the slug to the retired deal and refuse it.
 */
export function applyCustomPlanPrecedence<
  T extends { planId: string; organizationId: string | null },
>(rows: T[]): T[] {
  const customSlugs = new Set(rows.filter((r) => r.organizationId !== null).map((r) => r.planId));
  return rows.filter((r) => r.organizationId !== null || !customSlugs.has(r.planId));
}

/**
 * Which `subscription_plans` row a billing row's plan string means for this owner — what
 * every billing-row plan lookup (entitlements, seat limit, checkout) goes through. A
 * billing row's `plan` alone can't answer this without the owning organization, since an
 * org can have its own custom plan reusing a shared slug (specs/subscription-management-
 * plan.md's custom-plan design). Individuals always pass `organizationId: null`.
 */
export async function getSubscriptionPlanForBilling(
  tx: AnyExecutor,
  ownerType: OwnerType,
  planId: string,
  organizationId: string | null,
) {
  const candidates = await tx
    .select()
    .from(subscriptionPlans)
    .where(
      and(
        eq(subscriptionPlans.ownerType, ownerType),
        eq(subscriptionPlans.planId, planId),
        visibleToScope(organizationId),
      ),
    );
  return applyCustomPlanPrecedence(candidates)[0] ?? null;
}

/**
 * Every plan visible to this scope (active or not — precedence has to see retired custom
 * plans too, see `applyCustomPlanPrecedence`), with only the fields the customer-facing
 * plan list needs. Oldest first, so the seeded free tier naturally leads the list.
 */
export async function listPlansForScope(
  tx: AnyExecutor,
  ownerType: OwnerType,
  organizationId: string | null,
) {
  return tx
    .select({
      planId: subscriptionPlans.planId,
      organizationId: subscriptionPlans.organizationId,
      name: subscriptionPlans.name,
      description: subscriptionPlans.description,
      seatLimit: subscriptionPlans.seatLimit,
      providerPriceId: subscriptionPlans.providerPriceId,
      isActive: subscriptionPlans.isActive,
    })
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.ownerType, ownerType), visibleToScope(organizationId)))
    .orderBy(asc(subscriptionPlans.createdAt));
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
