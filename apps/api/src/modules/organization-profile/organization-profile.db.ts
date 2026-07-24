import { organizationProfile, eq, type DbExecutor } from "@repo/db";

// Every function here requires an explicit `tx` — a `withOrgScope`/`withSystemScope`
// transaction executor from @repo/db, never the bare `db` client — same reasoning as
// profile.db.ts/organization-billing.db.ts. See AGENTS.md's Row-Level Security section.
// Row creation itself is `ensureOrganizationProfileRow` from `@repo/db`, not duplicated
// here — see AGENTS.md's Organization Profile section for why it lives there.

export async function getOrganizationProfileByOrgId(tx: DbExecutor, organizationId: string) {
  const [row] = await tx
    .select()
    .from(organizationProfile)
    .where(eq(organizationProfile.organizationId, organizationId));
  return row ?? null;
}

interface OrganizationProfileUpdate {
  industry: string | null;
  companySize: string | null;
  website: string | null;
  phone: string | null;
  taxId: string | null;
  description: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
}

export async function updateOrganizationProfileByOrgId(
  tx: DbExecutor,
  organizationId: string,
  values: Partial<OrganizationProfileUpdate>,
) {
  await tx
    .update(organizationProfile)
    .set(values)
    .where(eq(organizationProfile.organizationId, organizationId));
}
