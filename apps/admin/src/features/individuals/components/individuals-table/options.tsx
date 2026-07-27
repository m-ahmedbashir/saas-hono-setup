// Matches packages/core/src/billing/types.ts's IndividualPlanId/SubscriptionStatus
// exactly — the same enums apps/api's platform-individuals.schema.ts validates
// against, not a UI-only guess at the value set.
export const PLAN_OPTIONS = [
  { value: "individual_free", label: "Free" },
  { value: "individual_pro", label: "Pro" },
];

export const SUBSCRIPTION_STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "past_due", label: "Past Due" },
  { value: "canceled", label: "Canceled" },
  { value: "incomplete", label: "Incomplete" },
];

// Single-select: "has" and "none" together mean the same thing as no filter at all,
// so this is deliberately variant "select" (one active choice), not "multiSelect".
export const ORGANIZATION_ASSOCIATION_OPTIONS = [
  { value: "has", label: "Has Organization" },
  { value: "none", label: "No Organization" },
];
