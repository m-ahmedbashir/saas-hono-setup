import { z } from "zod";
import { individualPlans } from "@repo/core";

const individualPlanIds = Object.keys(individualPlans) as [
  keyof typeof individualPlans,
  ...(keyof typeof individualPlans)[],
];

// No runtime const for this set in @repo/core (SubscriptionStatus is a type-only
// union, unlike IndividualPlanId which individualPlans gives a real object to derive
// keys from) — normalized across vendors per packages/core/src/billing/types.ts.
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

export const listPlatformIndividualsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().min(1).optional(),
  plan: csvEnumArray(individualPlanIds),
  subscriptionStatus: csvEnumArray(subscriptionStatuses),
  hasOrganization: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type ListPlatformIndividualsQuery = z.infer<typeof listPlatformIndividualsQuerySchema>;
