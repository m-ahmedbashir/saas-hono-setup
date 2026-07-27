import {
  organization,
  organizationBilling,
  organizationProfile,
  member,
  user,
  eq,
  and,
  count,
  desc,
  inArray,
  ilike,
  ensureOrganizationProfileRow,
  type DbExecutor,
  type AnyExecutor,
} from "@repo/db";

export interface PlatformOrganizationRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  plan: string | null;
  subscriptionStatus: string | null;
  seatQuantity: number | null;
  orgNumber: string | null;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  phone: string | null;
  taxId: string | null;
  // Nullable despite the column itself being NOT NULL on organization_profile — this is
  // a LEFT JOIN, so an org whose profile row doesn't exist yet (pre-dates the eager
  // creation hook) surfaces as null here, same as every other organizationProfile field
  // above.
  suspended: boolean | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
}

// Must run inside withSystemScope (platform-organizations.service.ts) — organization_
// billing and organization_profile are both RLS-enabled (FORCE ROW LEVEL SECURITY,
// migrations 0002/0005/0010), fail-closed to zero rows without either an org-scoped
// `set_config` or the system bypass flag set. `organization` itself has no RLS policy
// (Better-Auth-generated, see AGENTS.md), so it's queryable either way — joining it in
// the same transaction is just simpler than a separate connection.
export async function listOrganizationsPage(
  tx: DbExecutor,
  limit: number,
  offset: number,
  search?: string,
): Promise<PlatformOrganizationRow[]> {
  return tx
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      plan: organizationBilling.plan,
      subscriptionStatus: organizationBilling.subscriptionStatus,
      seatQuantity: organizationBilling.seatQuantity,
      orgNumber: organizationProfile.orgNumber,
      industry: organizationProfile.industry,
      companySize: organizationProfile.companySize,
      website: organizationProfile.website,
      phone: organizationProfile.phone,
      taxId: organizationProfile.taxId,
      suspended: organizationProfile.suspended,
      suspendedAt: organizationProfile.suspendedAt,
      suspensionReason: organizationProfile.suspensionReason,
    })
    .from(organization)
    .leftJoin(organizationBilling, eq(organizationBilling.organizationId, organization.id))
    .leftJoin(organizationProfile, eq(organizationProfile.organizationId, organization.id))
    .where(search ? ilike(organization.name, `%${search}%`) : undefined)
    .orderBy(desc(organization.createdAt))
    .limit(limit)
    .offset(offset);
}

// Same `search` filter as listOrganizationsPage, applied independently here rather
// than sharing one query — pagination's `total`/pageCount must reflect the filtered
// count, not the whole table's, or the last page would look like it has phantom rows.
export async function countOrganizations(tx: DbExecutor, search?: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(organization)
    .where(search ? ilike(organization.name, `%${search}%`) : undefined);
  return row?.value ?? 0;
}

// `organization` has no RLS policy (Better-Auth-generated), so a bare `db`/`DbExecutor`
// query works unscoped either way — used by createPlatformOrganization to check slug
// availability *before* creating the owner account, so the common failure (slug taken)
// doesn't leave a dangling user with no organization.
export async function organizationSlugExists(tx: AnyExecutor, slug: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug));
  return row !== undefined;
}

export async function organizationExists(
  tx: AnyExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, organizationId));
  return row !== undefined;
}

// Must run inside withSystemScope — organization_profile is RLS-enabled, and this is a
// platform-admin action on an arbitrary org, not something scoped to the caller's own
// active org. ensureOrganizationProfileRow first — an org created before the eager
// creation hook existed (or any other edge case where it didn't run) would otherwise
// have no row for this UPDATE to match. Flag-only, per specs/platform-organizations.md:
// clears suspendedAt/suspensionReason on unban rather than leaving stale data behind.
export async function setOrganizationSuspension(
  tx: DbExecutor,
  organizationId: string,
  suspended: boolean,
  reason: string | null,
): Promise<void> {
  await ensureOrganizationProfileRow(tx, organizationId);
  await tx
    .update(organizationProfile)
    .set({
      suspended,
      suspendedAt: suspended ? new Date() : null,
      suspensionReason: suspended ? reason : null,
    })
    .where(eq(organizationProfile.organizationId, organizationId));
}

export interface PlatformOrganizationDetailRow {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  suspended: boolean | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  seatQuantity: number | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  orgNumber: string | null;
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

// One row, not paginated — a detail page can afford the full profile/billing shape
// (address, description, raw Stripe ids) that listOrganizationsPage deliberately
// leaves out of the summary row shown for every org in the list.
export async function getOrganizationDetail(
  tx: DbExecutor,
  organizationId: string,
): Promise<PlatformOrganizationDetailRow | undefined> {
  const [row] = await tx
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      createdAt: organization.createdAt,
      suspended: organizationProfile.suspended,
      suspendedAt: organizationProfile.suspendedAt,
      suspensionReason: organizationProfile.suspensionReason,
      plan: organizationBilling.plan,
      subscriptionStatus: organizationBilling.subscriptionStatus,
      seatQuantity: organizationBilling.seatQuantity,
      providerCustomerId: organizationBilling.providerCustomerId,
      providerSubscriptionId: organizationBilling.providerSubscriptionId,
      orgNumber: organizationProfile.orgNumber,
      industry: organizationProfile.industry,
      companySize: organizationProfile.companySize,
      website: organizationProfile.website,
      phone: organizationProfile.phone,
      taxId: organizationProfile.taxId,
      description: organizationProfile.description,
      addressStreet: organizationProfile.addressStreet,
      addressCity: organizationProfile.addressCity,
      addressState: organizationProfile.addressState,
      addressPostalCode: organizationProfile.addressPostalCode,
      addressCountry: organizationProfile.addressCountry,
    })
    .from(organization)
    .leftJoin(organizationBilling, eq(organizationBilling.organizationId, organization.id))
    .leftJoin(organizationProfile, eq(organizationProfile.organizationId, organization.id))
    .where(eq(organization.id, organizationId));

  return row;
}

export interface OrganizationMemberRow {
  id: string;
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean | null;
  role: string;
  joinedAt: Date;
}

// Every member, not just the owner — unlike getOwnersAndMemberCounts (list rows only
// need the owner + a count), a detail page is the "who's in this org" view.
export async function getOrganizationMembers(
  tx: DbExecutor,
  organizationId: string,
): Promise<OrganizationMemberRow[]> {
  return tx
    .select({
      id: member.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      role: member.role,
      joinedAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(desc(member.createdAt));
}

export interface OrganizationOwnerAndMemberCount {
  organizationId: string;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerEmailVerified: boolean | null;
  ownerBanned: boolean | null;
  memberCount: number;
}

// Two queries instead of one combined aggregate join — member count (all roles) and
// owner details (role: "owner" only) filter/aggregate member differently, and forcing
// both into one query would need a correlated subquery per row. Scoped to just this
// page's organization ids, not the whole table, so this stays two queries per request,
// not N+1 per row.
export async function getOwnersAndMemberCounts(
  tx: DbExecutor,
  organizationIds: string[],
): Promise<OrganizationOwnerAndMemberCount[]> {
  if (organizationIds.length === 0) return [];

  const [memberCounts, owners] = await Promise.all([
    tx
      .select({ organizationId: member.organizationId, value: count() })
      .from(member)
      .where(inArray(member.organizationId, organizationIds))
      .groupBy(member.organizationId),
    tx
      .select({
        organizationId: member.organizationId,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        banned: user.banned,
      })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(inArray(member.organizationId, organizationIds), eq(member.role, "owner"))),
  ]);

  const memberCountById = new Map(memberCounts.map((row) => [row.organizationId, row.value]));
  const ownerById = new Map(owners.map((row) => [row.organizationId, row]));

  return organizationIds.map((organizationId) => {
    const owner = ownerById.get(organizationId);
    return {
      organizationId,
      ownerName: owner?.name ?? null,
      ownerEmail: owner?.email ?? null,
      ownerEmailVerified: owner?.emailVerified ?? null,
      ownerBanned: owner?.banned ?? null,
      memberCount: memberCountById.get(organizationId) ?? 0,
    };
  });
}
