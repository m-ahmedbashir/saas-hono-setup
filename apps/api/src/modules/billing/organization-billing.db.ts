import { organizationBilling, eq, and, or, isNull, lt, count, type DbExecutor } from "@repo/db";
import type { OrganizationPlanId, SubscriptionStatus } from "@repo/core";

// Every function here requires an explicit `tx` — a `withOrgScope`/`withSystemScope`
// transaction executor from @repo/db, never the bare `db` client — so it's impossible
// to accidentally query the RLS-enabled `organization_billing` table without
// deliberately choosing which context it runs under. See AGENTS.md's Row-Level
// Security section.

export async function getBillingByOrgId(tx: DbExecutor, organizationId: string) {
  const [row] = await tx
    .select()
    .from(organizationBilling)
    .where(eq(organizationBilling.organizationId, organizationId));
  return row ?? null;
}

/**
 * Read-only lookup by subscription id — unlike `updateBillingBySubscriptionId`, never
 * mutates anything, so it's safe to call purely to resolve which owner a subscription id
 * belongs to (e.g. `invoice.paid`'s handler needs this to build an `invoices` row,
 * without necessarily changing this table's own state at all).
 */
export async function getBillingBySubscriptionId(tx: DbExecutor, providerSubscriptionId: string) {
  const [row] = await tx
    .select()
    .from(organizationBilling)
    .where(eq(organizationBilling.providerSubscriptionId, providerSubscriptionId));
  return row ?? null;
}

/** Creates the row with defaults (free plan) if the org doesn't have one yet — every org gets exactly one. */
export async function ensureBillingRow(tx: DbExecutor, organizationId: string) {
  const existing = await getBillingByOrgId(tx, organizationId);
  if (existing) return existing;

  const [created] = await tx
    .insert(organizationBilling)
    .values({ id: crypto.randomUUID(), organizationId })
    .returning();
  return created!;
}

interface BillingUpdate {
  plan: OrganizationPlanId;
  providerCustomerId: string;
  providerSubscriptionId: string;
  subscriptionStatus: SubscriptionStatus;
  seatQuantity: number;
}

export async function updateBillingByOrgId(
  tx: DbExecutor,
  organizationId: string,
  values: Partial<BillingUpdate>,
) {
  await tx
    .update(organizationBilling)
    .set(values)
    .where(eq(organizationBilling.organizationId, organizationId));
}

/**
 * Returns the updated row (or `null` if this subscription id doesn't belong to this
 * table, OR if `eventCreatedAt` is older than the last event already applied) instead of
 * void — billing.handlers.ts's `subscription_updated`/`subscription_canceled` cases need
 * to know *whether* this was the matching table (an org vs an individual) to resolve the
 * right notification recipients; a bare `void` update can't tell them that.
 *
 * `eventCreatedAt` guards against out-of-order webhook delivery (see
 * specs/billing-integrity-plan.md's Fix 3): Stripe delivers at-least-once but not in
 * order, so a delayed retry of an older event could otherwise overwrite a row a newer
 * event already corrected. `lastEventAt IS NULL` (no lifecycle event applied yet) or
 * strictly older than the incoming event's own timestamp is required for the write to
 * take effect at all; an out-of-order event matches zero rows here — a real no-op, not a
 * mistaken overwrite.
 */
export async function updateBillingBySubscriptionId(
  tx: DbExecutor,
  providerSubscriptionId: string,
  eventCreatedAt: Date,
  values: Partial<BillingUpdate>,
) {
  const [updated] = await tx
    .update(organizationBilling)
    .set({ ...values, lastEventAt: eventCreatedAt })
    .where(
      and(
        eq(organizationBilling.providerSubscriptionId, providerSubscriptionId),
        or(
          isNull(organizationBilling.lastEventAt),
          lt(organizationBilling.lastEventAt, eventCreatedAt),
        ),
      ),
    )
    .returning();
  return updated ?? null;
}

/** Backs subscription-plans.service.ts's `activeSubscriberCount` — how many orgs currently have this plan string on their billing row, regardless of subscriptionStatus (matches "who would be affected by editing this plan," not just "who's actively paying"). */
export async function countByPlan(tx: DbExecutor, plan: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(organizationBilling)
    .where(eq(organizationBilling.plan, plan));
  return row?.value ?? 0;
}
