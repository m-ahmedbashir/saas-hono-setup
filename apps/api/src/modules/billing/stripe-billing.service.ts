import Stripe from "stripe";
import {
  AppError,
  type BillingEvent,
  type BillingGateway,
  type CheckoutSessionResult,
  type SubscriptionStatus,
} from "@repo/core";

// Constructed lazily (not at module load) so importing this file never throws
// when STRIPE_SECRET_KEY isn't configured yet — same guarded-no-op shape as
// apps/api/src/instrument.ts's Sentry init, just deferred to first use instead
// of a boolean flag, since every method here genuinely needs a live client.
function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new AppError("INTERNAL_ERROR", "STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key);
}

const checkoutReturnUrl =
  process.env.BILLING_CHECKOUT_RETURN_URL ?? "http://localhost:3000/billing";

/**
 * Concrete Stripe adapter for the `BillingGateway` contract defined in
 * `packages/core`. No file outside this one may import the `stripe` package —
 * see AGENTS.md's billing section. Has zero dependency on the plan catalog
 * (subscription-plans module) — `billing.service.ts` resolves a plan to a real
 * `providerPriceId` before ever calling in here, which is also what keeps this file
 * and the subscription-plans module from circularly depending on each other.
 */
export class StripeBillingService implements BillingGateway {
  async createCheckoutSession(
    orgId: string,
    planId: string,
    providerPriceId: string,
    quantity: number,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult> {
    const session = await getStripeClient().checkout.sessions.create(
      {
        mode: "subscription",
        client_reference_id: orgId,
        line_items: [{ price: providerPriceId, quantity }],
        success_url: `${checkoutReturnUrl}?checkout=success`,
        cancel_url: `${checkoutReturnUrl}?checkout=cancelled`,
        metadata: { ownerType: "organization", ownerId: orgId, planId },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    if (!session.url) {
      throw new AppError("INTERNAL_ERROR", "Stripe did not return a checkout URL");
    }

    return { checkoutUrl: session.url };
  }

  async createIndividualCheckoutSession(
    userId: string,
    planId: string,
    providerPriceId: string,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult> {
    const session = await getStripeClient().checkout.sessions.create(
      {
        mode: "subscription",
        client_reference_id: userId,
        line_items: [{ price: providerPriceId, quantity: 1 }],
        success_url: `${checkoutReturnUrl}?checkout=success`,
        cancel_url: `${checkoutReturnUrl}?checkout=cancelled`,
        metadata: { ownerType: "individual", ownerId: userId, planId },
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );

    if (!session.url) {
      throw new AppError("INTERNAL_ERROR", "Stripe did not return a checkout URL");
    }

    return { checkoutUrl: session.url };
  }

  async updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void> {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items.data[0];
    if (!item) {
      throw new AppError("INTERNAL_ERROR", `Subscription ${subscriptionId} has no items to update`);
    }

    await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: item.id, quantity }],
    });
  }

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getStripeClient().subscriptions.cancel(subscriptionId);
  }

  parseWebhookEvent(payload: string, signature: string): BillingEvent | null {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AppError("INTERNAL_ERROR", "STRIPE_WEBHOOK_SECRET is not configured");
    }

    // Pure signature verification needs no authenticated client, hence the
    // static accessor rather than getStripeClient() — this method must work
    // even if STRIPE_SECRET_KEY isn't set, since it's a different secret.
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new AppError("VALIDATION_ERROR", "Invalid Stripe webhook signature");
    }

    // Common to every mapped variant — see BillingEventEnvelope's doc comment
    // (packages/core/src/billing/types.ts) for why this is factored out instead of
    // repeated per case below. `event.data.object` is already a plain JS object by this
    // point (Stripe's SDK has finished parsing/verifying it), so casting to
    // `Record<string, unknown>` for the ledger's jsonb column is safe, not a type escape.
    const envelope = {
      stripeEventId: event.id,
      eventCreatedAt: new Date(event.created * 1000),
      rawPayload: event.data.object as unknown as Record<string, unknown>,
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const ownerId = session.client_reference_id;
        const ownerType = session.metadata?.ownerType;
        const planId = session.metadata?.planId;
        if (
          !ownerId ||
          !planId ||
          typeof session.customer !== "string" ||
          typeof session.subscription !== "string"
        ) {
          return null;
        }

        const shared = {
          ...envelope,
          type: "checkout_completed" as const,
          ownerId,
          providerCustomerId: session.customer,
          providerSubscriptionId: session.subscription,
          planId,
        };
        if (ownerType === "organization") {
          return { ...shared, ownerType };
        }
        if (ownerType === "individual") {
          return { ...shared, ownerType };
        }
        return null;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          ...envelope,
          type: "subscription_updated",
          providerSubscriptionId: subscription.id,
          status: mapStripeStatus(subscription.status),
          seatQuantity: subscription.items.data[0]?.quantity ?? 1,
        };
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          ...envelope,
          type: "subscription_canceled",
          providerSubscriptionId: subscription.id,
        };
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const providerSubscriptionId = toId(invoice.parent?.subscription_details?.subscription);
        if (!providerSubscriptionId) return null;

        return {
          ...envelope,
          type: "invoice_paid",
          providerSubscriptionId,
          stripeInvoiceId: invoice.id!,
          // Best-effort: only present if the invoice's `payments` sub-list happens to be
          // included on the webhook payload — see BillingEvent's doc comment on this
          // field for the full caveat. Not fetched via an extra API call in this pass.
          paymentIntentId: toId(invoice.payments?.data[0]?.payment.payment_intent) ?? null,
          amountTotal: invoice.amount_paid,
          currency: invoice.currency,
          receiptUrl: invoice.hosted_invoice_url ?? null,
        };
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const providerSubscriptionId = toId(invoice.parent?.subscription_details?.subscription);
        if (!providerSubscriptionId) return null;

        return { ...envelope, type: "invoice_payment_failed", providerSubscriptionId };
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId = toId(charge.payment_intent);
        if (!paymentIntentId) return null;

        return { ...envelope, type: "charge_refunded", paymentIntentId };
      }
      case "charge.dispute.created": {
        const dispute = event.data.object as Stripe.Dispute;
        return {
          ...envelope,
          type: "charge_dispute_created",
          paymentIntentId: toId(dispute.payment_intent),
        };
      }
      default:
        return null;
    }
  }

  async validatePriceId(priceId: string): Promise<{ active: boolean; recurring: boolean }> {
    let price: Stripe.Price;
    try {
      price = await getStripeClient().prices.retrieve(priceId);
    } catch {
      throw new AppError("VALIDATION_ERROR", `Stripe price "${priceId}" was not found`);
    }
    return { active: price.active, recurring: price.recurring !== null };
  }
}

/**
 * Normalizes one of Stripe's many `string | ExpandableObject | null | undefined`
 * reference fields (customer, subscription, payment_intent, ...) down to a plain id —
 * present as a bare string on an unexpanded webhook payload, or an object with its own
 * `id` if the caller happened to expand it. Returns `null` for anything else (missing,
 * or a `DeletedX` stub with no live `id` to trust).
 */
function toId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    default:
      return "incomplete";
  }
}

export const billingService: BillingGateway = new StripeBillingService();
