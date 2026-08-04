/**
 * Illustrative feature set for this foundation, same spirit as the plan catalog itself
 * (see specs/subscription-management-plan.md) — a real product replaces these with its
 * own. This is the one closed vocabulary that must never move to the database: admins
 * can toggle these known keys on/off per plan, but adding a genuinely new capability
 * still requires a code change, on purpose — the code cannot enforce a feature it has
 * never heard of.
 */
export type FeatureKey =
  "priority_support" | "advanced_analytics" | "api_access" | "custom_branding";

export type PlanLimitKey = "maxProjects" | "maxApiRequestsPerMonth";

export interface PlanEntitlements {
  features: Record<FeatureKey, boolean>;
  limits: Record<PlanLimitKey, number>;
}

// Runtime companions to FeatureKey/PlanLimitKey — the types above are compile-time
// only, with nothing to hand Zod (subscription-plans.schema.ts) or resolvePlanEntitlements
// below at runtime. Derived from a Record so omitting a key here is a `tsc` error, not
// a silent gap — same exhaustiveness guarantee `billing.schema.ts`'s `individualPlanIds`
// gets from `Object.keys(individualPlans)`, just with no natural object of its own to
// derive from here.
const featureKeyRegistry: Record<FeatureKey, true> = {
  priority_support: true,
  advanced_analytics: true,
  api_access: true,
  custom_branding: true,
};
const limitKeyRegistry: Record<PlanLimitKey, true> = {
  maxProjects: true,
  maxApiRequestsPerMonth: true,
};
export const featureKeys = Object.keys(featureKeyRegistry) as [FeatureKey, ...FeatureKey[]];
export const limitKeys = Object.keys(limitKeyRegistry) as [PlanLimitKey, ...PlanLimitKey[]];

/**
 * Deny-most fallback, used only when a plan row genuinely doesn't exist (e.g. a billing
 * row referencing a `planId` with no matching `subscription_plans` row at all — a seed
 * gap, not a deactivated plan, which still resolves its real entitlements normally, and
 * not a DB error, which must propagate instead of silently downgrading a paying
 * customer — see subscription-plans.service.ts's `resolveEntitlementsForPlan`).
 */
export const fallbackEntitlements: PlanEntitlements = {
  features: {
    priority_support: false,
    advanced_analytics: false,
    api_access: false,
    custom_branding: false,
  },
  limits: { maxProjects: 0, maxApiRequestsPerMonth: 0 },
};

/**
 * Re-validates a plan row's raw JSONB against the closed FeatureKey/PlanLimitKey
 * vocabularies on every read — not just at the POST/PATCH write boundary
 * (subscription-plans.schema.ts). A FeatureKey renamed or removed in a later code
 * change must not let a stale DB row referencing the old key keep resolving as if it
 * were still valid: unknown keys are dropped, missing known keys default to
 * `false`/`0`. Pure — no DB/HTTP, same as the functions below.
 */
export function resolvePlanEntitlements(raw: {
  features: Record<string, boolean>;
  limits: Record<string, number>;
}): PlanEntitlements {
  const features = {} as Record<FeatureKey, boolean>;
  for (const key of featureKeys) {
    features[key] = raw.features[key] ?? false;
  }
  const limits = {} as Record<PlanLimitKey, number>;
  for (const key of limitKeys) {
    limits[key] = raw.limits[key] ?? 0;
  }
  return { features, limits };
}

/**
 * Pure, environment-agnostic — no DB/HTTP. Resolving a `PlanEntitlements` from a real
 * plan row is the caller's job (`subscription-plans.service.ts`'s
 * `resolveEntitlementsForPlan`, called from `entitlement.middleware.ts`).
 */
export function canAccessFeature(entitlements: PlanEntitlements, feature: FeatureKey): boolean {
  return entitlements.features[feature];
}

export function getPlanLimit(entitlements: PlanEntitlements, limit: PlanLimitKey): number {
  return entitlements.limits[limit];
}
