import { z } from "zod";

// planId is a plain string, not a closed enum — plans are admin-editable rows in
// packages/db's subscriptionPlans table now (see specs/subscription-management-plan.md),
// not a compile-time-enumerable set. Whether a given planId actually exists (and is
// active, and has a price) is checked in billing.service.ts against the real catalog,
// not at this schema layer.
export const checkoutRequestSchema = z.object({
  planId: z.string().min(1),
  quantity: z.number().int().positive().max(1000),
});

export type CheckoutRequest = z.infer<typeof checkoutRequestSchema>;

// No `quantity` field at all — individual billing has no seat concept, so exposing
// one here would be exactly the kind of monolithic-type-forces-unused-field thing
// AGENTS.md's ISP rule calls out. Always a quantity of one, decided server-side.
export const individualCheckoutRequestSchema = z.object({
  planId: z.string().min(1),
});

export type IndividualCheckoutRequest = z.infer<typeof individualCheckoutRequestSchema>;
