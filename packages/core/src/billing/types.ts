export type PlanId = "free" | "starter" | "growth";

export interface PlanConfig {
  id: PlanId;
  name: string;
  seatLimit: number;
  /** Vendor-specific price identifier (e.g. a Stripe Price ID). `null` for a plan with no paid provider-side counterpart. */
  providerPriceId: string | null;
}

/**
 * Example tier map for this foundation — a real product replaces these three
 * with its own tiers/limits. Kept here (not hand-scaffolded further) since
 * `BillingGateway` and the seat-limit middleware need *some* concrete PlanId
 * to type-check against.
 */
export const plans: Record<PlanId, PlanConfig> = {
  free: { id: "free", name: "Free", seatLimit: 3, providerPriceId: null },
  starter: {
    id: "starter",
    name: "Starter",
    seatLimit: 10,
    providerPriceId: process.env.STRIPE_PRICE_STARTER ?? null,
  },
  growth: {
    id: "growth",
    name: "Growth",
    seatLimit: 50,
    providerPriceId: process.env.STRIPE_PRICE_GROWTH ?? null,
  },
};

/** Normalized across vendors — a `BillingGateway` implementation maps its own provider's statuses onto this set. */
export type SubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete";

export interface CheckoutSessionResult {
  checkoutUrl: string;
}

/**
 * Normalized webhook outcomes, vendor-specific event types already translated
 * away. Without this, the webhook *route* would have to import the vendor SDK
 * itself just to read event payloads — defeating the "swap vendor, touch zero
 * routes" goal for the one part of a billing integration where that's hardest.
 */
export type BillingEvent =
  | {
      type: "checkout_completed";
      orgId: string;
      providerCustomerId: string;
      providerSubscriptionId: string;
      planId: PlanId;
    }
  | {
      type: "subscription_updated";
      providerSubscriptionId: string;
      status: SubscriptionStatus;
      seatQuantity: number;
    }
  | { type: "subscription_canceled"; providerSubscriptionId: string };

/**
 * Vendor-agnostic billing contract. `packages/core` only knows this shape —
 * no implementation here may import a payment SDK. The concrete adapter
 * (e.g. `StripeBillingService`) lives in `apps/api`, following the same
 * interface-in-core / implementation-in-apps/api split as `NotificationDispatcher`.
 */
export interface BillingGateway {
  createCheckoutSession(
    orgId: string,
    planId: PlanId,
    quantity: number,
  ): Promise<CheckoutSessionResult>;
  updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the raw webhook payload's signature and returns a normalized event, or `null` for an event type this gateway doesn't map. Throws `AppError` on a bad signature. */
  parseWebhookEvent(payload: string, signature: string): BillingEvent | null;
}
