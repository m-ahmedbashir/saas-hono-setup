import { z } from "zod";

// No runtime const for this set in @repo/core (SubscriptionStatus is a type-only
// union) — normalized across vendors per packages/core/src/billing/types.ts.
const subscriptionStatuses: [string, ...string[]] = [
  "active",
  "past_due",
  "canceled",
  "incomplete",
];

// Facet filters arrive as one comma-separated query value (apps/admin's
// DataTableFacetedFilter joins multi-select picks with ","), not repeated keys —
// split before validating each member against its enum.
function csvEnumArray<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(
    (val) => {
      if (typeof val !== "string" || val.length === 0) return undefined;
      return val.split(",");
    },
    z.array(z.enum(values)).optional(),
  );
}

// `plan` is a plain string array, not a closed enum — individual plan ids are
// admin-editable rows in `subscription_plans` now (see
// specs/subscription-management-plan.md), not a compile-time-enumerable set. Hardcoding
// "individual_free"/"individual_pro" here would silently go stale the moment an admin
// adds a third individual tier.
function csvStringArray() {
  return z.preprocess((val) => {
    if (typeof val !== "string" || val.length === 0) return undefined;
    return val.split(",");
  }, z.array(z.string()).optional());
}

export const listPlatformIndividualsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().min(1).optional(),
  plan: csvStringArray(),
  subscriptionStatus: csvEnumArray(subscriptionStatuses),
  hasOrganization: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type ListPlatformIndividualsQuery = z.infer<typeof listPlatformIndividualsQuerySchema>;
