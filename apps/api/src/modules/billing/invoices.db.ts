import { invoices, eq, type AnyExecutor } from "@repo/db";
import { AppError } from "@repo/core";

// invoices isn't RLS-enabled either (same system-populated reasoning as billingEvents),
// so this takes `AnyExecutor` too. Unlike billingEvents, normal app_user grants apply —
// markInvoiceRefunded's UPDATE is a real, intentional mutation, not a bug to guard
// against. See AGENTS.md's Row-Level Security section and schema.ts's table comment.

export interface NewInvoice {
  id: string;
  ownerType: "organization" | "individual";
  organizationId: string | null;
  userId: string | null;
  planId: string;
  amountTotal: number;
  currency: string;
  stripeInvoiceId: string;
  stripePaymentIntentId: string | null;
  providerSubscriptionId: string;
  receiptUrl: string | null;
  issuedAt: Date;
}

export async function insertInvoice(tx: AnyExecutor, values: NewInvoice) {
  const [created] = await tx
    .insert(invoices)
    .values({ ...values, status: "paid" })
    .returning();
  return created!;
}

/**
 * Marks the invoice matching `stripePaymentIntentId` as refunded. Throws — doesn't
 * silently no-op — if no row matches, per specs/billing-integrity-plan.md's Fix 4: a
 * `charge.refunded` can legitimately arrive before the `invoice.paid` it belongs to
 * (Stripe delivery isn't ordered), and swallowing "no match" here would permanently lose
 * the refund from this curated table the moment that race happens. The caller
 * (`billing.handlers.ts`) lets this propagate so the whole transaction (ledger insert
 * included) rolls back and Stripe's own retry schedule redelivers the event later, by
 * which point the invoice row normally exists.
 */
export async function markInvoiceRefunded(tx: AnyExecutor, stripePaymentIntentId: string) {
  const [updated] = await tx
    .update(invoices)
    .set({ status: "refunded" })
    .where(eq(invoices.stripePaymentIntentId, stripePaymentIntentId))
    .returning();

  if (!updated) {
    throw new AppError(
      "INTERNAL_ERROR",
      `No invoice found for payment intent ${stripePaymentIntentId} — likely arrived before its invoice.paid event`,
    );
  }
  return updated;
}
