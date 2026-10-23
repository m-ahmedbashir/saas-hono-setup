import { z } from "zod";
import type { OrganizationProfile, OrganizationProfileUpdate } from "../api/service";

// UX-only validation mirroring apps/api's organization-profile.schema.ts — the server stays
// the authority. Every field is a string in the form; an empty one is sent as null (cleared).
const optional = (max: number) => z.string().trim().max(max, `Must be ${max} characters or fewer`);

export const organizationNameSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(100, "Name is too long"),
});

export type OrganizationNameValues = z.infer<typeof organizationNameSchema>;

export const organizationProfileSchema = z.object({
  industry: optional(100),
  companySize: optional(50),
  // http(s) only: the value is shown as a link, so a javascript: URL must never get this far.
  website: optional(500).refine(
    (value) => value === "" || /^https?:\/\/\S+$/i.test(value),
    "Enter a full web address starting with http:// or https://",
  ),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\+?[1-9]\d{6,14}$/.test(value),
      "Use digits only, optionally starting with +",
    ),
  taxId: optional(50),
  description: optional(2000),
  addressStreet: optional(200),
  addressCity: optional(100),
  addressState: optional(100),
  addressPostalCode: optional(20),
  addressCountry: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^[A-Za-z]{2}$/.test(value),
      'Use a two-letter country code, e.g. "US"',
    ),
});

export type OrganizationProfileValues = z.infer<typeof organizationProfileSchema>;

export function toProfileFormValues(profile: OrganizationProfile): OrganizationProfileValues {
  return {
    industry: profile.industry ?? "",
    companySize: profile.companySize ?? "",
    website: profile.website ?? "",
    phone: profile.phone ?? "",
    taxId: profile.taxId ?? "",
    description: profile.description ?? "",
    addressStreet: profile.address.street ?? "",
    addressCity: profile.address.city ?? "",
    addressState: profile.address.state ?? "",
    addressPostalCode: profile.address.postalCode ?? "",
    addressCountry: profile.address.country ?? "",
  };
}

const orNull = (value: string) => value.trim() || null;

/**
 * Only the fields that differ from `saved`, a cleared one as null — PATCH treats an omitted
 * field as unchanged, so two people editing different fields at once don't overwrite each
 * other. Never includes orgNumber. An empty object means nothing changed.
 */
export function toProfileUpdate(
  values: OrganizationProfileValues,
  saved: OrganizationProfile,
): OrganizationProfileUpdate {
  const update: OrganizationProfileUpdate = {};
  const set = <K extends keyof typeof saved & keyof OrganizationProfileUpdate>(
    key: K,
    next: string | null,
  ) => {
    if (next !== saved[key]) Object.assign(update, { [key]: next });
  };
  set("industry", orNull(values.industry));
  set("companySize", orNull(values.companySize));
  set("website", orNull(values.website));
  set("phone", orNull(values.phone));
  set("taxId", orNull(values.taxId));
  set("description", orNull(values.description));

  const nextAddress = {
    street: orNull(values.addressStreet),
    city: orNull(values.addressCity),
    state: orNull(values.addressState),
    postalCode: orNull(values.addressPostalCode),
    country: orNull(values.addressCountry)?.toUpperCase() ?? null,
  };
  const address = Object.fromEntries(
    Object.entries(nextAddress).filter(
      ([key, value]) => value !== saved.address[key as keyof typeof nextAddress],
    ),
  );
  if (Object.keys(address).length > 0) update.address = address;

  return update;
}
