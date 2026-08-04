import * as z from "zod";

// UX-only validation, same reasoning as every other schema in this app — apps/api's
// own subscription-plans.schema.ts remains the real authority, including the exact
// closed feature/limit key enforcement. This form only ever renders inputs for the
// known keys (features/limits objects below are built from @repo/core's featureKeys/
// limitKeys, see options.ts), so there's no key-drift risk to validate against
// client-side the way the server has to.
export const subscriptionPlanFormSchema = z.object({
  ownerType: z.enum(["organization", "individual"]),
  planId: z
    .string()
    .min(1, "Plan ID is required")
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, hyphens, or underscores only"),
  organizationId: z.string(),
  name: z.string().min(1, "Name is required").max(200),
  description: z.string(),
  // No z.coerce here on purpose — FormTextField's type="number" already converts the
  // raw input into a number (or "" when empty) before it ever reaches form state (see
  // text-field.tsx's handleChange), so the schema's input type must match that exactly
  // (number | ""), not `unknown`, which is what z.coerce.number() would widen it to —
  // AGENTS.md's apps/admin section calls this out directly: a mismatch here breaks
  // useAppForm's validators.onSubmit type-checking.
  seatLimit: z.union([z.literal(""), z.number().int().positive()]),
  providerPriceId: z.string(),
  features: z.record(z.string(), z.boolean()),
  limits: z.record(z.string(), z.number()),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});

export type SubscriptionPlanFormValues = z.infer<typeof subscriptionPlanFormSchema>;
