import { describe, it, expect } from "vitest";
import { resolvePlanEntitlements, canAccessFeature, getPlanLimit } from "./entitlements";

// Pure unit tests — no DB/HTTP, matches this repo's "pure unit" testing pattern
// (AGENTS.md's Testing section). resolvePlanEntitlements is the read-side half of
// "typed but DB-editable" (specs/subscription-management-plan.md) — these prove it
// actually re-validates a plan row's raw JSONB against the closed FeatureKey/
// PlanLimitKey vocabularies, not just at the write boundary.

describe("resolvePlanEntitlements", () => {
  it("carries through every known key present in the raw row", () => {
    const entitlements = resolvePlanEntitlements({
      features: {
        priority_support: true,
        advanced_analytics: false,
        api_access: true,
        custom_branding: false,
      },
      limits: { maxProjects: 20, maxApiRequestsPerMonth: 50_000 },
    });

    expect(canAccessFeature(entitlements, "priority_support")).toBe(true);
    expect(canAccessFeature(entitlements, "advanced_analytics")).toBe(false);
    expect(getPlanLimit(entitlements, "maxProjects")).toBe(20);
    expect(getPlanLimit(entitlements, "maxApiRequestsPerMonth")).toBe(50_000);
  });

  it("drops unknown keys instead of leaking them into PlanEntitlements", () => {
    const entitlements = resolvePlanEntitlements({
      features: { priority_support: true, some_removed_feature: true } as never,
      limits: { maxProjects: 5, someRemovedLimit: 999 } as never,
    });

    expect(entitlements.features).not.toHaveProperty("some_removed_feature");
    expect(entitlements.limits).not.toHaveProperty("someRemovedLimit");
  });

  it("defaults missing known keys to false/0, matching PlanEntitlements' closed shape exactly", () => {
    const entitlements = resolvePlanEntitlements({ features: {}, limits: {} });

    expect(entitlements.features).toEqual({
      priority_support: false,
      advanced_analytics: false,
      api_access: false,
      custom_branding: false,
    });
    expect(entitlements.limits).toEqual({ maxProjects: 0, maxApiRequestsPerMonth: 0 });
  });
});
