import { db, withSystemScope } from "@repo/db";
import {
  AppError,
  resolvePlanEntitlements,
  fallbackEntitlements,
  type PlanEntitlements,
} from "@repo/core";
import { billingService } from "../billing/stripe-billing.service";
import { countByPlan as countOrgSubscribersByPlan } from "../billing/organization-billing.db";
import { countByPlan as countIndividualSubscribersByPlan } from "../billing/individual-billing.db";
import {
  listSubscriptionPlans,
  getSubscriptionPlanById,
  getSubscriptionPlanForBilling,
  getDefaultSharedPlan,
  listOtherActiveSharedPlans,
  insertSubscriptionPlan,
  updateSubscriptionPlan,
  clearOtherDefaults,
  type OwnerType,
  type SubscriptionPlanFilters,
  type SubscriptionPlanRow,
} from "./subscription-plans.db";
import type {
  CreateSubscriptionPlanInput,
  UpdateSubscriptionPlanInput,
} from "./subscription-plans.schema";

function isUniqueViolation(err: unknown, constraintName: string): boolean {
  const pgErr = err as { code?: string; constraint?: string };
  return pgErr?.code === "23505" && pgErr?.constraint === constraintName;
}

async function assertValidPriceId(providerPriceId: string | undefined): Promise<void> {
  if (!providerPriceId) return;
  const { active, recurring } = await billingService.validatePriceId(providerPriceId);
  if (!active || !recurring) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Stripe price "${providerPriceId}" must be active and recurring to be used for a plan`,
    );
  }
}

export async function listPlans(filters: SubscriptionPlanFilters) {
  return listSubscriptionPlans(db, filters);
}

export interface SubscriptionPlanWithSubscriberCount extends SubscriptionPlanRow {
  activeSubscriberCount: number;
}

/**
 * Backs `GET /:id` — surfaces how many billing rows currently reference this plan, so
 * the admin UI can warn before a price edit (specs/subscription-management-plan.md
 * item 5: editing `providerPriceId` never touches subscribers already on the plan,
 * which is exactly the kind of silent-no-op an admin needs visibility into).
 */
export async function getPlanWithSubscriberCount(
  id: string,
): Promise<SubscriptionPlanWithSubscriberCount> {
  const plan = await getSubscriptionPlanById(db, id);
  if (!plan) {
    throw new AppError("NOT_FOUND", "Subscription plan not found");
  }

  // organization_billing/individual_billing are both RLS-enabled — this is a
  // platform-wide read across every tenant's row, trusted via requirePlatformPermission
  // (already checked before this ever runs), same reasoning withSystemScope's own doc
  // comment describes and the same pattern platform-organizations/platform-individuals
  // already use for identical platform-wide oversight reads.
  const activeSubscriberCount = await withSystemScope((tx) =>
    plan.ownerType === "organization"
      ? countOrgSubscribersByPlan(tx, plan.planId)
      : countIndividualSubscribersByPlan(tx, plan.planId),
  );

  return { ...plan, activeSubscriberCount };
}

/**
 * The one function `entitlement.middleware.ts`/`seat-limit.middleware.ts`/
 * `billing.service.ts` all call directly (in-process, no HTTP hop — see
 * specs/subscription-management-plan.md's "Internal resolution never goes through the
 * HTTP route"). Custom-then-shared resolution — see `getSubscriptionPlanForBilling`'s
 * own comment for why `organizationId` matters even for a plain string `planId` lookup.
 */
export async function getPlanForBilling(
  ownerType: OwnerType,
  planId: string,
  organizationId: string | null,
): Promise<SubscriptionPlanRow | null> {
  return getSubscriptionPlanForBilling(db, ownerType, planId, organizationId);
}

/**
 * What `entitlement.middleware.ts`/`seat-limit.middleware.ts` use for an
 * organization/user with no billing row at all yet — replaces the old hardcoded
 * `"free"`/`"individual_free"` fallback string, per
 * specs/subscription-management-plan.md's Assumptions section: `isDefault` only means
 * something if it's actually consulted here, not just stored. Falls back to the
 * historical literal id only if no plan is flagged default at all (a seed/data gap,
 * not expected steady state) — never throws, since a brand-new signup with no billing
 * row must still resolve to *something*.
 */
export async function getDefaultPlanId(ownerType: OwnerType): Promise<string> {
  const row = await getDefaultSharedPlan(db, ownerType);
  if (row) return row.planId;
  return ownerType === "organization" ? "free" : "individual_free";
}

/**
 * Resolves a billing row's plan string into `PlanEntitlements` — the only place a
 * missing plan row and a real DB error are handled *differently*, on purpose (see
 * specs/subscription-management-plan.md's "Closing the payment-correctness gaps" item
 * 3): a genuinely missing row (e.g. a seed gap) degrades to `fallbackEntitlements`
 * (deny-most) and logs a warning; a thrown DB error propagates unchanged rather than
 * silently downgrading a paying customer during a transient outage.
 */
export async function resolveEntitlementsForPlan(
  ownerType: OwnerType,
  planId: string,
  organizationId: string | null,
): Promise<PlanEntitlements> {
  const plan = await getPlanForBilling(ownerType, planId, organizationId);
  if (!plan) {
    console.warn(
      `[subscription-plans] no plan row for ${ownerType}/${planId}` +
        (organizationId ? ` (org ${organizationId})` : "") +
        " — falling back to deny-most entitlements. This is a data-integrity gap (e.g. a seed/backfill gap), not expected steady state.",
    );
    return fallbackEntitlements;
  }
  return resolvePlanEntitlements({ features: plan.features, limits: plan.limits });
}

export async function createPlan(input: CreateSubscriptionPlanInput): Promise<SubscriptionPlanRow> {
  if (input.organizationId && input.isDefault) {
    throw new AppError("VALIDATION_ERROR", "Custom plans cannot be marked as the default plan");
  }
  if (input.isDefault && !input.isActive) {
    throw new AppError("VALIDATION_ERROR", "A plan must be active to be the default plan");
  }

  await assertValidPriceId(input.providerPriceId);

  const id = crypto.randomUUID();

  try {
    return await db.transaction(async (tx) => {
      // No existing row can already have this id, so this trivially just clears
      // whatever the current default is — the real backstop against two defaults is
      // still the partial unique index, not this call.
      if (input.isDefault) {
        await clearOtherDefaults(tx, input.ownerType, id);
      }
      return insertSubscriptionPlan(tx, {
        id,
        ownerType: input.ownerType,
        planId: input.planId,
        organizationId: input.organizationId ?? null,
        name: input.name,
        description: input.description ?? null,
        seatLimit: input.seatLimit ?? null,
        providerPriceId: input.providerPriceId ?? null,
        features: input.features,
        limits: input.limits,
        isActive: input.isActive,
        isDefault: input.isDefault,
      });
    });
  } catch (err) {
    if (
      isUniqueViolation(err, "subscription_plans_owner_plan_org_idx") ||
      isUniqueViolation(err, "subscription_plans_shared_owner_plan_idx")
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `A plan with id "${input.planId}" already exists in this scope`,
      );
    }
    if (isUniqueViolation(err, "subscription_plans_one_default_per_owner_type_idx")) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The default plan was changed concurrently — please retry",
      );
    }
    throw err;
  }
}

export async function updatePlan(
  id: string,
  input: UpdateSubscriptionPlanInput,
): Promise<SubscriptionPlanRow> {
  const existing = await getSubscriptionPlanById(db, id);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Subscription plan not found");
  }

  if (existing.organizationId && input.isDefault) {
    throw new AppError("VALIDATION_ERROR", "Custom plans cannot be marked as the default plan");
  }
  if (input.isDefault && !input.isActive) {
    throw new AppError("VALIDATION_ERROR", "A plan must be active to be the default plan");
  }

  const ownerType = existing.ownerType as OwnerType;
  const isSharedPlan = existing.organizationId === null;

  // Deactivating/un-defaulting the current default plan is blocked, not silently
  // allowed — the admin must assign a different default first (a separate PATCH to
  // that other plan, which itself clears this flag via clearOtherDefaults). There's no
  // way to reassign default *and* change this row in the same request, so this is
  // unconditional whenever it applies.
  if (isSharedPlan && existing.isDefault && (!input.isDefault || !input.isActive)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Assign a different default plan for this ownerType before changing this one",
    );
  }

  const changingPriceId =
    input.providerPriceId !== undefined && input.providerPriceId !== existing.providerPriceId;
  if (changingPriceId) {
    await assertValidPriceId(input.providerPriceId);
  }

  try {
    return await db.transaction(async (tx) => {
      // Deactivating the *last* active shared plan is blocked too, even when it isn't
      // the default — the vacuous-truth gap "no default among the active ones" alone
      // would miss (specs/subscription-management-plan.md item 6).
      if (isSharedPlan && existing.isActive && !input.isActive) {
        const others = await listOtherActiveSharedPlans(tx, ownerType, id);
        if (others.length === 0) {
          throw new AppError(
            "VALIDATION_ERROR",
            "Cannot deactivate the last active plan for this ownerType",
          );
        }
      }

      if (input.isDefault) {
        await clearOtherDefaults(tx, ownerType, id);
      }

      const updated = await updateSubscriptionPlan(tx, id, {
        name: input.name,
        description: input.description ?? null,
        seatLimit: input.seatLimit ?? null,
        providerPriceId: input.providerPriceId ?? null,
        features: input.features,
        limits: input.limits,
        isActive: input.isActive,
        isDefault: input.isDefault,
      });
      return updated!;
    });
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (isUniqueViolation(err, "subscription_plans_one_default_per_owner_type_idx")) {
      throw new AppError(
        "VALIDATION_ERROR",
        "The default plan was changed concurrently — please retry",
      );
    }
    throw err;
  }
}
