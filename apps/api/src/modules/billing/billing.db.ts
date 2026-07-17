import { db, billing, eq } from "@repo/db";
import type { PlanId, SubscriptionStatus } from "@repo/core";

export async function getBillingByOrgId(organizationId: string) {
  const [row] = await db.select().from(billing).where(eq(billing.organizationId, organizationId));
  return row ?? null;
}

/** Creates the row with defaults (free plan) if the org doesn't have one yet — every org gets exactly one. */
export async function ensureBillingRow(organizationId: string) {
  const existing = await getBillingByOrgId(organizationId);
  if (existing) return existing;

  const [created] = await db
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

export async function updateBillingByOrgId(organizationId: string, values: Partial<BillingUpdate>) {
  await db.update(billing).set(values).where(eq(billing.organizationId, organizationId));
}

export async function updateBillingBySubscriptionId(
  providerSubscriptionId: string,
  values: Partial<BillingUpdate>,
) {
  await db
    .update(billing)
    .set(values)
    .where(eq(billing.providerSubscriptionId, providerSubscriptionId));
}
