import { z } from "zod";
import { organizationPlans, individualPlans } from "@repo/core";

const organizationPlanIds = Object.keys(organizationPlans) as [
  keyof typeof organizationPlans,
  ...(keyof typeof organizationPlans)[],
];

export const checkoutRequestSchema = z.object({
  planId: z.enum(organizationPlanIds),
  quantity: z.number().int().positive().max(1000),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

const individualPlanIds = Object.keys(individualPlans) as [
  keyof typeof individualPlans,
  ...(keyof typeof individualPlans)[],
];

// No `quantity` field at all — individual billing has no seat concept, so exposing
// one here would be exactly the kind of monolithic-type-forces-unused-field thing
// AGENTS.md's ISP rule calls out. Always a quantity of one, decided server-side.
export const individualCheckoutRequestSchema = z.object({
  planId: z.enum(individualPlanIds),
});

export type IndividualCheckoutRequest = z.infer<typeof individualCheckoutRequestSchema>;
