import { billing, eq, type DbExecutor } from "@repo/db";
import type { PlanId, SubscriptionStatus } from "@repo/core";

// Every function here requires an explicit `tx` — a `withOrgScope`/`withSystemScope`
// transaction executor from @repo/db, never the bare `db` client — so it's impossible
// to accidentally query the RLS-enabled `billing` table without deliberately choosing
// which context it runs under. See AGENTS.md's Row-Level Security section.

export async function getBillingByOrgId(tx: DbExecutor, organizationId: string) {
  const [row] = await tx.select().from(billing).where(eq(billing.organizationId, organizationId));
  return row ?? null;
}

/** Creates the row with defaults (free plan) if the org doesn't have one yet — every org gets exactly one. */
export async function ensureBillingRow(tx: DbExecutor, organizationId: string) {
  const existing = await getBillingByOrgId(tx, organizationId);
  if (existing) return existing;

  const [created] = await tx
    .insert(billing)
    .values({ id: crypto.randomUUID(), organizationId })
    .returning();
  return created!;
}

interface BillingUpdate {
  plan: PlanId;
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
  await tx.update(billing).set(values).where(eq(billing.organizationId, organizationId));
}

export async function updateBillingBySubscriptionId(
  tx: DbExecutor,
  providerSubscriptionId: string,
  values: Partial<BillingUpdate>,
) {
  await tx
    .update(billing)
    .set(values)
    .where(eq(billing.providerSubscriptionId, providerSubscriptionId));
}
