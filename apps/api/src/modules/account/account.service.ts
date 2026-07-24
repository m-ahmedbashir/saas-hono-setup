import { db, withOrgScope, withUserScope } from "@repo/db";
import { AppError } from "@repo/core";
import { billingService } from "../billing/stripe-billing.service";
import {
  getOrganizationsOwnedBy,
  getOrganizationMemberCount,
  getOrganizationSubscriptionId,
  getIndividualSubscriptionId,
  deleteOrganizationBilling,
  deleteOrganization,
  deleteProfileAndIndividualBilling,
  deleteUser,
} from "./account.db";

// `profile`/`individual_billing`/`organization_billing` all have FORCE ROW LEVEL
// SECURITY (see AGENTS.md). Postgres applies RLS policies to rows touched by an
// ON DELETE CASCADE action too, not just direct statements — so deleting `user`/
// `organization` and trusting the FK cascade to clean up those specific child tables
// would run their cascade-delete unscoped (no app.current_user_id/current_org_id set),
// which the fail-closed policy would then block, turning the FK constraint into a hard
// error instead of a clean delete. Explicitly deleting the RLS-protected rows first,
// under the correct scope, avoids relying on cascade to do something RLS is designed to
// prevent by default. Non-RLS tables (session, account, member, invitation, organization
// itself) are left to cascade normally.

/**
 * Best-effort — a live Stripe subscription being uncancellable (API down, no
 * STRIPE_SECRET_KEY configured in this environment) must never block a user's own
 * permanent data-deletion request. A stray still-active subscription left behind is a
 * billing-ops follow-up, not a reason to refuse to delete someone's data.
 */
async function cancelSubscriptionBestEffort(subscriptionId: string | null): Promise<void> {
  if (!subscriptionId) return;
  try {
    await billingService.cancelSubscription(subscriptionId);
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}

export async function deleteAccount(userId: string): Promise<void> {
  const ownedOrganizations = await getOrganizationsOwnedBy(db, userId);

  const soloOrganizations = [];
  for (const org of ownedOrganizations) {
    const memberCount = await getOrganizationMemberCount(db, org.id);
    if (memberCount > 1) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Transfer ownership or remove other members from "${org.name}" before deleting your account`,
      );
    }
    soloOrganizations.push(org);
  }

  // Only reached once every owned org has either no other members or doesn't exist —
  // an org this user solely owns and is the only member of has nothing to hand off, so
  // it's deleted along with the account rather than left permanently orphaned.
  for (const org of soloOrganizations) {
    const subscriptionId = await withOrgScope(org.id, (tx) =>
      getOrganizationSubscriptionId(tx, org.id),
    );
    await cancelSubscriptionBestEffort(subscriptionId);
    await withOrgScope(org.id, (tx) => deleteOrganizationBilling(tx, org.id));
    await deleteOrganization(db, org.id);
  }

  const individualSubscriptionId = await withUserScope(userId, (tx) =>
    getIndividualSubscriptionId(tx, userId),
  );
  await cancelSubscriptionBestEffort(individualSubscriptionId);
  await withUserScope(userId, (tx) => deleteProfileAndIndividualBilling(tx, userId));

  await deleteUser(db, userId);
}
