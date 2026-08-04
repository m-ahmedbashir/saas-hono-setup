import { organizationBilling, eq, count, type DbExecutor } from "@repo/db";
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

export async function updateBillingBySubscriptionId(
  tx: DbExecutor,
  providerSubscriptionId: string,
  values: Partial<BillingUpdate>,
) {
  await tx
    .update(organizationBilling)
    .set(values)
    .where(eq(organizationBilling.providerSubscriptionId, providerSubscriptionId));
}

/** Backs subscription-plans.service.ts's `activeSubscriberCount` — how many orgs currently have this plan string on their billing row, regardless of subscriptionStatus (matches "who would be affected by editing this plan," not just "who's actively paying"). */
export async function countByPlan(tx: DbExecutor, plan: string): Promise<number> {
  const [row] = await tx
    .select({ value: count() })
    .from(organizationBilling)
    .where(eq(organizationBilling.plan, plan));
  return row?.value ?? 0;
}
