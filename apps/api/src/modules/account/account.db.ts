import {
  member,
  organization,
  individualBilling,
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

// Cascades profile, individual_billing, session, account, remaining member rows,
// invitation.inviterId — cascade actions aren't subject to RLS, so no explicit
// pre-delete of the RLS-protected ones is needed. See AGENTS.md's "Account deletion"
// section.
export async function deleteUser(tx: AnyExecutor, userId: string) {
  await tx.delete(user).where(eq(user.id, userId));
}
