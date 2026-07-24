import { withOrgScope, ensureOrganizationProfileRow } from "@repo/db";
import {
  getOrganizationProfileByOrgId,
  updateOrganizationProfileByOrgId,
} from "./organization-profile.db";
import type { UpdateOrganizationProfileRequest } from "./organization-profile.schema";

export interface OrganizationProfileView {
  orgNumber: string;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  phone: string | null;
  taxId: string | null;
  description: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
  };
}

function toView(
  row: NonNullable<Awaited<ReturnType<typeof getOrganizationProfileByOrgId>>>,
): OrganizationProfileView {
  return {
    orgNumber: row.orgNumber,
    industry: row.industry,
    companySize: row.companySize,
    website: row.website,
    phone: row.phone,
    taxId: row.taxId,
    description: row.description,
    address: {
      street: row.addressStreet,
      city: row.addressCity,
      state: row.addressState,
      postalCode: row.addressPostalCode,
      country: row.addressCountry,
    },
  };
}

// `ensureOrganizationProfileRow` here is a defensive fallback, not the primary creation
// path — new orgs already get their row eagerly via the `afterCreateOrganization` hook
// (packages/core/src/auth/index.ts). This covers orgs created before that hook existed,
// or any other edge case where it didn't run. Idempotent either way, so calling it on
// every read/write is cheap and correct, not wasteful.

export async function getOrganizationProfile(
  organizationId: string,
): Promise<OrganizationProfileView> {
  const row = await withOrgScope(organizationId, (tx) =>
    ensureOrganizationProfileRow(tx, organizationId),
  );
  return toView(row);
}

export async function updateOrganizationProfile(
  organizationId: string,
  input: UpdateOrganizationProfileRequest,
): Promise<OrganizationProfileView> {
  const row = await withOrgScope(organizationId, async (tx) => {
    await ensureOrganizationProfileRow(tx, organizationId);
    await updateOrganizationProfileByOrgId(tx, organizationId, {
      ...(input.industry !== undefined && { industry: input.industry }),
      ...(input.companySize !== undefined && { companySize: input.companySize }),
      ...(input.website !== undefined && { website: input.website }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.taxId !== undefined && { taxId: input.taxId }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.address?.street !== undefined && { addressStreet: input.address.street }),
      ...(input.address?.city !== undefined && { addressCity: input.address.city }),
      ...(input.address?.state !== undefined && { addressState: input.address.state }),
      ...(input.address?.postalCode !== undefined && {
        addressPostalCode: input.address.postalCode,
      }),
      ...(input.address?.country !== undefined && { addressCountry: input.address.country }),
    });
    return getOrganizationProfileByOrgId(tx, organizationId);
  });

  return toView(row!);
}
