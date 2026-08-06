import { billingEvents, eq, type AnyExecutor } from "@repo/db";

// billingEvents isn't RLS-enabled (system-populated audit log, no session-scoped owner
// to check against — see schema.ts's comment on the table), so this takes `AnyExecutor`
// like subscription-plans.db.ts's functions, not the stricter `DbExecutor` RLS-enabled
// tables require. See AGENTS.md's Row-Level Security section.

export interface NewBillingEvent {
  id: string;
  stripeEventId: string;
  type: string;
  ownerType: "organization" | "individual" | null;
  ownerId: string | null;
  eventCreatedAt: Date;
  payload: Record<string, unknown>;
}

/**
 * The actual idempotency guard for inbound webhook processing (see
 * specs/billing-integrity-plan.md's Fix 1) — `onConflictDoNothing` targets
 * `stripeEventId`'s unique constraint, so a duplicate delivery of the same Stripe event
 * inserts nothing and this returns `null` instead of throwing. The caller
 * (`billing.handlers.ts`) treats `null` as "already processed, skip the rest of this
 * event" rather than as an error.
 */
export async function insertBillingEvent(tx: AnyExecutor, values: NewBillingEvent) {
  const [created] = await tx
    .insert(billingEvents)
    .values(values)
    .onConflictDoNothing({ target: billingEvents.stripeEventId })
    .returning();
  return created ?? null;
}

/** Test-only lookup — no production code needs to read this ledger back yet. */
export async function getBillingEventByStripeId(tx: AnyExecutor, stripeEventId: string) {
  const [row] = await tx
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.stripeEventId, stripeEventId));
  return row ?? null;
}
