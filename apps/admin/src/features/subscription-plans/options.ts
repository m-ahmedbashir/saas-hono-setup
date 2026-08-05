import {
  featureKeys,
  limitKeys,
  type FeatureKey,
  type PlanLimitKey,
} from "@repo/core/billing/entitlements";

export { featureKeys, limitKeys };

// Display labels only — the actual closed vocabulary (which keys exist at all) lives
// in @repo/core/billing/entitlements, imported via its own subpath so this stays out
// of the auth-connecting root barrel (see AGENTS.md's apps/admin section on
// @repo/core subpaths).
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  priority_support: "Priority Support",
  advanced_analytics: "Advanced Analytics",
  api_access: "API Access",
  custom_branding: "Custom Branding",
};

export const LIMIT_LABELS: Record<PlanLimitKey, string> = {
  maxProjects: "Max Projects",
  maxApiRequestsPerMonth: "Max API Requests / Month",
};

export const OWNER_TYPE_OPTIONS = [
  { value: "organization", label: "Organization" },
  { value: "individual", label: "Individual" },
];
