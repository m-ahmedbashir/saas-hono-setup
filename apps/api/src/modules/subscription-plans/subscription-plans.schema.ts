import { z } from "zod";
import { featureKeys, limitKeys } from "@repo/core";

const ownerTypeSchema = z.enum(["organization", "individual"]);

export const listSubscriptionPlansQuerySchema = z.object({
  ownerType: ownerTypeSchema.optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export type ListSubscriptionPlansQuery = z.infer<typeof listSubscriptionPlansQuerySchema>;

// z.record with an enum key type requires every known key present — exactly what the
// admin form submits (a toggle per FeatureKey, a number field per PlanLimitKey), and
// what keeps a plan row from silently missing a key resolvePlanEntitlements would
// otherwise have to default anyway. This is the write-side half of the read/write
// key-revalidation pair described in specs/subscription-management-plan.md — the read
// side is resolvePlanEntitlements itself (packages/core/src/billing/entitlements.ts).
const featuresSchema = z.record(z.enum(featureKeys), z.boolean());
const limitsSchema = z.record(z.enum(limitKeys), z.number().int().nonnegative());

// planId is a slug — used verbatim as organization_billing.plan/individual_billing.plan's
// string value, so it needs to be safe to store/compare/URL-embed without escaping.
const planIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_-]+$/, "Use lowercase letters, numbers, hyphens, or underscores only");

export const createSubscriptionPlanSchema = z.object({
  ownerType: ownerTypeSchema,
  planId: planIdSchema,
  // Present ⇒ a private/custom plan for that one organization only. Absent ⇒ shared.
  organizationId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  // No seat concept for individual plans — the admin UI simply doesn't render this
  // field for ownerType: "individual"; nothing here forbids sending it, since a stray
  // seatLimit on an individual plan is harmless (nothing ever reads it for that
  // ownerType) rather than worth a cross-field refinement for.
  seatLimit: z.number().int().positive().optional(),
  providerPriceId: z.string().min(1).optional(),
  features: featuresSchema,
  limits: limitsSchema,
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false),
});

export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;

// Same shape as create, minus the three fields that define what a plan fundamentally
// is (ownerType/planId/organizationId) — those are immutable after creation, not a
// partial-PATCH surface. The admin edit sheet always submits every field at once (one
// caller, whole-form state), so there's no "omitted vs explicit null" distinction to
// make here the way profile.schema.ts needs for its many independent partial callers.
export const updateSubscriptionPlanSchema = createSubscriptionPlanSchema.omit({
  ownerType: true,
  planId: true,
  organizationId: true,
});

export type UpdateSubscriptionPlanInput = z.infer<typeof updateSubscriptionPlanSchema>;
