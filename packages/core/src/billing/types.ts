// Runtime strings, not closed unions — plan catalogs are admin-editable rows in
// packages/db's `subscriptionPlans` table now (see specs/subscription-management-plan.md),
// not a compile-time-enumerable set. The closed vocabulary that must never move to the
// database is FeatureKey/PlanLimitKey (./entitlements.ts) — a plan *id* was always just
// a lookup key, not a real enum of "the finite set of plans that can ever exist"; it
// only looked like one while plans happened to be hardcoded.
export type OrganizationPlanId = string;
export type IndividualPlanId = string;

/** Normalized across vendors — a `BillingGateway` implementation maps its own provider's statuses onto this set. */
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

export interface CheckoutSessionResult {
  checkoutUrl: string;
}

/**
 * Every variant's common envelope, needed for `billing_events`' ledger row — not for any
 * billing *logic*, which is why it's factored out instead of repeated per variant.
 * `stripeEventId`/`eventCreatedAt` are Stripe's own `id`/`created` fields (the latter is
 * the ordering guard `organization_billing`/`individual_billing`'s `lastEventAt` columns
 * compare against — see specs/billing-integrity-plan.md's Fix 3); `rawPayload` is the
 * verbatim event object the ledger stores as-is. `apps/api`'s `billing.handlers.ts` reads
 * these three fields to write the ledger row without ever touching a Stripe type itself —
 * they're already plain data by the time `parseWebhookEvent` hands them back.
 */
interface BillingEventEnvelope {
  stripeEventId: string;
  eventCreatedAt: Date;
  rawPayload: Record<string, unknown>;
}

/**
 * Normalized webhook outcomes, vendor-specific event types already translated
 * away. Without this, the webhook *route* would have to import the vendor SDK
 * itself just to read event payloads — defeating the "swap vendor, touch zero
 * routes" goal for the one part of a billing integration where that's hardest.
 *
 * `checkout_completed` is a discriminated union on `ownerType` (not just `orgId`
 * widened to a generic id) because organization and individual checkouts still write to
 * different tables (`organization_billing` vs `individual_billing`) — the handler
 * branches on `ownerType` to decide which one, even though `planId` itself is now the
 * same `string` type on both branches.
 *
 * `invoice_paid`/`invoice_payment_failed`/`charge_refunded`/`charge_dispute_created`
 * deliberately don't carry `ownerType`/`ownerId`/`planId` — unlike `checkout_completed`,
 * these never originate one, so there's nothing to widen into `OrganizationPlanId` union
 * for. `billing.handlers.ts` resolves the owning row the same way it already does for
 * `subscription_updated`/`subscription_canceled`: look it up by `providerSubscriptionId`/
 * `paymentIntentId` against the already-durable `organization_billing`/`individual_billing`/
 * `invoices` tables, not from anything Stripe echoes back on the event itself.
 */
export type BillingEvent = BillingEventEnvelope &
  (
    | {
        type: "checkout_completed";
        ownerType: "organization";
        ownerId: string;
        providerCustomerId: string;
        providerSubscriptionId: string;
        planId: OrganizationPlanId;
      }
    | {
        type: "checkout_completed";
        ownerType: "individual";
        ownerId: string;
        providerCustomerId: string;
        providerSubscriptionId: string;
        planId: IndividualPlanId;
      }
    | {
        type: "subscription_updated";
        providerSubscriptionId: string;
        status: SubscriptionStatus;
        seatQuantity: number;
      }
    | { type: "subscription_canceled"; providerSubscriptionId: string }
    | {
        type: "invoice_paid";
        providerSubscriptionId: string;
        stripeInvoiceId: string;
        // The `invoices` table's join key for a later charge_refunded — a PaymentIntent
        // id, not a Charge id. Verified against the installed stripe@22.3.2 types:
        // Stripe's newer API decoupled Charge from Invoice entirely (no `charge.invoice`
        // field exists), while `payment_intent` is a stable, always-present field on
        // both `Charge` and `InvoicePayment.Payment`. Nullable because it depends on the
        // invoice's `payments` sub-list actually being present on the webhook payload —
        // see stripe-billing.service.ts's extraction comment for the exact caveat.
        paymentIntentId: string | null;
        amountTotal: number;
        currency: string;
        receiptUrl: string | null;
      }
    | { type: "invoice_payment_failed"; providerSubscriptionId: string }
    | { type: "charge_refunded"; paymentIntentId: string }
    | { type: "charge_dispute_created"; paymentIntentId: string | null }
  );

/**
 * Vendor-agnostic billing contract. `packages/core` only knows this shape —
 * no implementation here may import a payment SDK. The concrete adapter
 * (e.g. `StripeBillingService`) lives in `apps/api`, following the same
 * interface-in-core / implementation-in-apps/api split as `NotificationDispatcher`.
 */
export interface BillingGateway {
  /**
   * `providerPriceId` is resolved by the caller (`billing.service.ts`, via the
   * subscription-plans module) before this is ever called — the gateway itself has zero
   * dependency on our plan catalog, only on a real Stripe Price id it's handed. `planId`
   * is still passed through as opaque metadata, embedded in the session so the webhook
   * handler later knows which plan a completed checkout was for.
   *
   * `idempotencyKey`, when the caller supplies one (e.g. an `Idempotency-Key` request
   * header), is passed straight through to the vendor so a retried HTTP request to this
   * API returns the same checkout session instead of creating a second one. The vendor
   * SDK generating its own key per call (which the Stripe adapter's underlying SDK does)
   * only protects its own internal network-retry — it can't protect against our own
   * caller retrying the request to us, since that looks like a brand new call each time.
   */
  createCheckoutSession(
    orgId: string,
    planId: OrganizationPlanId,
    providerPriceId: string,
    quantity: number,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult>;
  /** Individual billing has no seat/quantity concept — always a quantity of one. */
  createIndividualCheckoutSession(
    userId: string,
    planId: IndividualPlanId,
    providerPriceId: string,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult>;
  updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the raw webhook payload's signature and returns a normalized event, or `null` for an event type this gateway doesn't map. Throws `AppError` on a bad signature. */
  parseWebhookEvent(payload: string, signature: string): BillingEvent | null;
  /**
   * Verifies an admin-entered Stripe Price id is real, active, and recurring — called
   * from `subscription-plans.service.ts` on every create/update that sets a
   * `providerPriceId`, so a typo'd or non-recurring price is caught at admin-save time
   * instead of at a real customer's checkout attempt. Throws `AppError` if the id
   * doesn't resolve to a Stripe Price at all.
   */
  validatePriceId(priceId: string): Promise<{ active: boolean; recurring: boolean }>;
}
