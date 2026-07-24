import { z } from "zod";
import { plans, individualPlans } from "@repo/core";

const planIds = Object.keys(plans) as [keyof typeof plans, ...(keyof typeof plans)[]];

export const checkoutRequestSchema = z.object({
  planId: z.enum(planIds),
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
