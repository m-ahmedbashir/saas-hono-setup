import { db, withUserScope } from "@repo/db";
import { AppError } from "@repo/core";
import { billingService } from "../billing/stripe-billing.service";
import { deleteOrganization } from "../organization/organization.service";
import {
  getOrganizationsOwnedBy,
  getOrganizationMemberCount,
  getIndividualSubscriptionId,
  deleteUser,
} from "./account.db";

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
  // it's deleted along with the account rather than left permanently orphaned. Reuses
  // organization.service.ts's deleteOrganization (same subscription-cancel + delete
  // sequence a direct DELETE /organization does) rather than duplicating it here.
  for (const org of soloOrganizations) {
    await deleteOrganization(org.id);
  }

  const individualSubscriptionId = await withUserScope(userId, (tx) =>
    getIndividualSubscriptionId(tx, userId),
  );
  await cancelSubscriptionBestEffort(individualSubscriptionId);

  await deleteUser(db, userId);
}
