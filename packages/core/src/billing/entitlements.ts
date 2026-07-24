import type { OrganizationPlanId, IndividualPlanId } from "./types";

/**
 * Illustrative feature set for this foundation, same spirit as `organizationPlans`/
 * `individualPlans` in `./types.ts` — a real product replaces these with its own.
 */
export type FeatureKey =
  "priority_support" | "advanced_analytics" | "api_access" | "custom_branding";

export type PlanLimitKey = "maxProjects" | "maxApiRequestsPerMonth";

export interface PlanEntitlements {
  features: Record<FeatureKey, boolean>;
  limits: Record<PlanLimitKey, number>;
}

/**
 * Deliberately separate maps from `organizationPlans`/`individualPlans`, not a field
 * added to `OrganizationPlanConfig`/`IndividualPlanConfig` — those describe what Stripe
 * needs to know about a plan (a billing/vendor concern); this describes what the app's
 * own authorization layer allows (a different concern, different reason to change).
 * Keyed by the same `OrganizationPlanId`/`IndividualPlanId` types those configs already
 * use — `Record`'s exhaustiveness makes a missing entry for a new plan id a compile
 * error here, not a silent gap.
 */
export const organizationPlanEntitlements: Record<OrganizationPlanId, PlanEntitlements> = {
  free: {
    features: {
      priority_support: false,
      advanced_analytics: false,
      api_access: false,
      custom_branding: false,
    },
    limits: { maxProjects: 3, maxApiRequestsPerMonth: 1_000 },
  },
  starter: {
    features: {
      priority_support: false,
      advanced_analytics: true,
      api_access: true,
      custom_branding: false,
    },
    limits: { maxProjects: 20, maxApiRequestsPerMonth: 50_000 },
  },
  growth: {
    features: {
      priority_support: true,
      advanced_analytics: true,
      api_access: true,
      custom_branding: true,
    },
    limits: { maxProjects: 200, maxApiRequestsPerMonth: 500_000 },
  },
};

export const individualPlanEntitlements: Record<IndividualPlanId, PlanEntitlements> = {
  individual_free: {
    features: {
      priority_support: false,
      advanced_analytics: false,
      api_access: false,
      custom_branding: false,
    },
    limits: { maxProjects: 1, maxApiRequestsPerMonth: 100 },
  },
  individual_pro: {
    features: {
      priority_support: true,
      advanced_analytics: true,
      api_access: true,
      custom_branding: false,
    },
    limits: { maxProjects: 10, maxApiRequestsPerMonth: 10_000 },
  },
};

/**
 * The one thing that generalizes "which plan is this" across the two otherwise-separate
 * billing universes (see AGENTS.md's Billing model section) — every caller that needs to
 * check entitlements goes through this discriminated union instead of assuming
 * organization or individual. Mirrors `BillingEvent`'s `ownerType` discriminant on
 * purpose, same reasoning: organization and individual plan ids are different types, so
 * TypeScript narrows `planId` along with `ownerType`.
 */
export type BillingOwner =
  | { ownerType: "organization"; planId: OrganizationPlanId }
  | { ownerType: "individual"; planId: IndividualPlanId };

function resolveEntitlements(owner: BillingOwner): PlanEntitlements {
  return owner.ownerType === "organization"
    ? organizationPlanEntitlements[owner.planId]
    : individualPlanEntitlements[owner.planId];
}

/**
 * Pure, environment-agnostic — no DB/HTTP. Resolving `owner.planId` from a real billing
 * row is the caller's job (see `requireFeature` in apps/api's entitlement.middleware.ts).
 */
export function canAccessFeature(owner: BillingOwner, feature: FeatureKey): boolean {
  return resolveEntitlements(owner).features[feature];
}

export function getPlanLimit(owner: BillingOwner, limit: PlanLimitKey): number {
  return resolveEntitlements(owner).limits[limit];
}
