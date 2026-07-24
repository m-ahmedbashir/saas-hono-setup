import { organization, organizationBilling, eq, type DbExecutor, type AnyExecutor } from "@repo/db";

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

// Cascades organization_billing, organization_profile, member, invitation — cascade
// actions aren't subject to RLS, so no explicit pre-delete of the RLS-protected ones is
// needed. See AGENTS.md's "Account deletion" section (same reasoning applies here).
// Member rows cascading away is just the end of each member's *membership* — no
// member's own user/profile/individual_billing row is touched. See organization.service.ts.
export async function deleteOrganizationRow(tx: AnyExecutor, organizationId: string) {
  await tx.delete(organization).where(eq(organization.id, organizationId));
}
