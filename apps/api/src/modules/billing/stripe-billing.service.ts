import Stripe from "stripe";
import {
  AppError,
  organizationPlans,
  individualPlans,
  type BillingEvent,
  type BillingGateway,
  type CheckoutSessionResult,
  type IndividualPlanId,
  type OrganizationPlanId,
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
 * see AGENTS.md's billing section.
 */
export class StripeBillingService implements BillingGateway {
  async createCheckoutSession(
    orgId: string,
    planId: OrganizationPlanId,
    quantity: number,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult> {
    const plan = organizationPlans[planId];
    if (!plan.providerPriceId) {
      throw new AppError("VALIDATION_ERROR", `Plan "${planId}" has no billable price configured`);
    }

    const session = await getStripeClient().checkout.sessions.create(
      {
        mode: "subscription",
        client_reference_id: orgId,
        line_items: [{ price: plan.providerPriceId, quantity }],
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
    planId: IndividualPlanId,
    idempotencyKey?: string,
  ): Promise<CheckoutSessionResult> {
    const plan = individualPlans[planId];
    if (!plan.providerPriceId) {
      throw new AppError("VALIDATION_ERROR", `Plan "${planId}" has no billable price configured`);
    }

    const session = await getStripeClient().checkout.sessions.create(
      {
        mode: "subscription",
        client_reference_id: userId,
        line_items: [{ price: plan.providerPriceId, quantity: 1 }],
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
          type: "checkout_completed" as const,
          ownerId,
          providerCustomerId: session.customer,
          providerSubscriptionId: session.subscription,
        };
        if (ownerType === "organization") {
          return { ...shared, ownerType, planId: planId as OrganizationPlanId };
        }
        if (ownerType === "individual") {
          return { ...shared, ownerType, planId: planId as IndividualPlanId };
        }
        return null;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        return {
          type: "subscription_updated",
          providerSubscriptionId: subscription.id,
          status: mapStripeStatus(subscription.status),
          seatQuantity: subscription.items.data[0]?.quantity ?? 1,
        };
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        return { type: "subscription_canceled", providerSubscriptionId: subscription.id };
      }
      default:
        return null;
    }
  }
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
