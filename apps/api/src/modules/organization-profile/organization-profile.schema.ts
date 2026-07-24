import { z } from "zod";

// Same field-level rules as profile.schema.ts where they overlap (phone, address,
// country) — kept consistent rather than re-deriving independently.
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{6,14}$/, "Phone must be digits only, optionally prefixed with +")
  .nullable();

const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Country must be an ISO 3166-1 alpha-2 code (e.g. "US")')
  .nullable();

const addressSchema = z
  .object({
    street: z.string().max(200).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    state: z.string().max(100).nullable().optional(),
    postalCode: z.string().max(20).nullable().optional(),
    country: countrySchema.optional(),
  })
  .optional();

// No `orgNumber` field, on purpose — it's system-generated and permanent, never
// client-settable. All other fields optional (PATCH semantics: omitted = unchanged,
// explicit null = cleared), same convention as profile.schema.ts.
export const updateOrganizationProfileSchema = z.object({
  industry: z.string().max(100).nullable().optional(),
  companySize: z.string().max(50).nullable().optional(),
  website: z.string().url().max(500).nullable().optional(),
  phone: phoneSchema.optional(),
  taxId: z.string().max(50).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  address: addressSchema,
});

export type UpdateOrganizationProfileRequest = z.infer<typeof updateOrganizationProfileSchema>;
