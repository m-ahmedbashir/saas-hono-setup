import { db, withOrgScope } from "@repo/db";
import { billingService } from "../billing/stripe-billing.service";
import { getOrganizationSubscriptionId, deleteOrganizationRow } from "./organization.db";

/**
 * Best-effort — same reasoning as account.service.ts's identical helper: a live Stripe
 * subscription being uncancellable (API down, no STRIPE_SECRET_KEY configured) must
 * never block deleting the organization's own data.
 */
async function cancelSubscriptionBestEffort(subscriptionId: string | null): Promise<void> {
  if (!subscriptionId) return;
  try {
    await billingService.cancelSubscription(subscriptionId);
  } catch {
    // Intentionally swallowed — see doc comment above.
  }
}

/**
 * Permanently deletes an organization and everything that belongs to *it* — billing,
 * profile, memberships, pending invitations. Deliberately does NOT touch any member's
 * personal account (their `user`/`profile`/`individual_billing` rows).
 *
 * GDPR's right to erasure belongs to each individual data subject, not to whatever
 * organization they happen to belong to — an organization isn't a data subject at all,
 * only the people in it are. An org owner deleting the org has no more right to erase a
 * member's personal data than any unrelated third party would; only that member's own
 * request (`DELETE /account`) can do that. Deleting the org just ends everyone's
 * membership/access to it (their `member` row cascades away), the same as if they'd
 * been individually removed — their account, profile, and billing stay exactly as they
 * were, fully under their own control.
 *
 * No "block if other members exist" guard, unlike `account.service.ts`'s deletion path
 * — that guard exists specifically because deleting your *own* account shouldn't
 * *silently* take an org other people depend on down with it as a side effect. Calling
 * this function is an explicit, deliberate "delete this organization" action by its
 * owner (gated by the `organization: ["delete"]` permission, owner-only) — there's no
 * silent side effect to guard against here.
 */
export async function deleteOrganization(organizationId: string): Promise<void> {
  const subscriptionId = await withOrgScope(organizationId, (tx) =>
    getOrganizationSubscriptionId(tx, organizationId),
  );
  await cancelSubscriptionBestEffort(subscriptionId);
  await deleteOrganizationRow(db, organizationId);
}
