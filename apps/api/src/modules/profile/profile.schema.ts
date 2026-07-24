import { z } from "zod";

// Loose but real E.164-ish check (optional leading +, 7-15 digits) — strict enough to
// reject garbage, loose enough not to fight legitimate international numbers.
const phoneSchema = z
  .string()
  .regex(/^\+?[1-9]\d{6,14}$/, "Phone must be digits only, optionally prefixed with +")
  .nullable();

// ISO 3166-1 alpha-2, not a free-text country name — "US"/"USA"/"United States" are all
// the same country to a human but three different strings to a filter/tax rule.
const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Country must be an ISO 3166-1 alpha-2 code (e.g. "US")')
  .nullable();

const oldestPlausibleDateOfBirth = new Date(Date.UTC(new Date().getUTCFullYear() - 130, 0, 1));

const dateOfBirthSchema = z.coerce
  .date()
  .max(new Date(), "dateOfBirth cannot be in the future")
  .min(oldestPlausibleDateOfBirth, "dateOfBirth is not plausible")
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

// All fields optional (PATCH semantics: omitted = leave unchanged, explicit null =
// clear it) — never a monolithic type forcing a client to resend the whole profile to
// change one field.
export const updateProfileSchema = z.object({
  phone: phoneSchema.optional(),
  dateOfBirth: dateOfBirthSchema.optional(),
  address: addressSchema,
});

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
