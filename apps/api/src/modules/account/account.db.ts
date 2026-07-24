import {
  member,
  organization,
  organizationBilling,
  individualBilling,
  profile,
  user,
  eq,
  and,
  count,
  type DbExecutor,
  type AnyExecutor,
} from "@repo/db";

export interface OwnedOrganization {
  id: string;
  name: string;
}

/** Orgs where this user holds the "owner" role — the accountable party, not just any member. */
export async function getOrganizationsOwnedBy(
  tx: AnyExecutor,
  userId: string,
): Promise<OwnedOrganization[]> {
  return tx
    .select({ id: organization.id, name: organization.name })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));
}

export async function getOrganizationMemberCount(
  tx: AnyExecutor,
  organizationId: string,
): Promise<number> {
  const [row] = await tx
    .select({ memberCount: count() })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  return row?.memberCount ?? 0;
}

export async function getOrganizationSubscriptionId(
  tx: DbExecutor,
  organizationId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ providerSubscriptionId: organizationBilling.providerSubscriptionId })
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId));
  return row?.providerSubscriptionId ?? null;
}

export async function getIndividualSubscriptionId(
  tx: DbExecutor,
  userId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ providerSubscriptionId: individualBilling.providerSubscriptionId })
    .from(individualBilling)
    .where(eq(individualBilling.userId, userId));
  return row?.providerSubscriptionId ?? null;
}

export async function deleteOrganizationBilling(tx: DbExecutor, organizationId: string) {
  await tx
    .delete(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId));
}

// Not RLS-protected (Better Auth-generated table) — cascades `member`/`invitation` rows
// scoped to this org, neither of which is RLS-protected either. Must run after
// deleteOrganizationBilling: that table IS RLS-protected, and its FK's ON DELETE CASCADE
// would otherwise have to cascade-delete it unscoped — see account.service.ts's header
// comment for why that's unsafe to rely on.
export async function deleteOrganization(tx: AnyExecutor, organizationId: string) {
  await tx.delete(organization).where(eq(organization.id, organizationId));
}

export async function deleteProfileAndIndividualBilling(tx: DbExecutor, userId: string) {
  await tx.delete(profile).where(eq(profile.userId, userId));
  await tx.delete(individualBilling).where(eq(individualBilling.userId, userId));
}

// Cascades `session`/`account`/remaining `member` rows/`invitation.inviterId` — none of
// which are RLS-protected, so no explicit pre-delete needed for those, unlike profile/
// individualBilling above.
export async function deleteUser(tx: AnyExecutor, userId: string) {
  await tx.delete(user).where(eq(user.id, userId));
}
