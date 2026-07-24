export type OrganizationPlanId = "free" | "starter" | "growth";

export interface OrganizationPlanConfig {
  id: OrganizationPlanId;
  name: string;
  seatLimit: number;
  /** Vendor-specific price identifier (e.g. a Stripe Price ID). `null` for a plan with no paid provider-side counterpart. */
  providerPriceId: string | null;
}

/**
 * Example tier map for this foundation — a real product replaces these three
 * with its own tiers/limits. Kept here (not hand-scaffolded further) since
 * `BillingGateway` and the seat-limit middleware need *some* concrete OrganizationPlanId
 * to type-check against.
 */
export const organizationPlans: Record<OrganizationPlanId, OrganizationPlanConfig> = {
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

/**
 * Individual (B2C) billing tiers — deliberately a separate map from `organizationPlans`, not a
 * variant of it. An individual isn't seat-based (no `seatLimit`/quantity concept),
 * so forcing it into `OrganizationPlanConfig`'s shape would mean a meaningless field on one side
 * or the other. See AGENTS.md's Billing model section for the organization-vs-individual split.
 */
export type IndividualPlanId = "individual_free" | "individual_pro";

export interface IndividualPlanConfig {
  id: IndividualPlanId;
  name: string;
  providerPriceId: string | null;
}

export const individualPlans: Record<IndividualPlanId, IndividualPlanConfig> = {
  individual_free: { id: "individual_free", name: "Individual Free", providerPriceId: null },
  individual_pro: {
    id: "individual_pro",
    name: "Individual Pro",
    providerPriceId: process.env.STRIPE_PRICE_INDIVIDUAL_PRO ?? null,
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
 *
 * `checkout_completed` is a discriminated union on `ownerType` (not just `orgId`
 * widened to a generic id) because organization and individual checkouts resolve to
 * different plan maps (`OrganizationPlanId` vs `IndividualPlanId`) — the handler branches on
 * `ownerType` to decide which table (`organization_billing` vs `individual_billing`) to write to, and
 * TypeScript narrows `planId`'s type along with it.
 */
export type BillingEvent =
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
    planId: OrganizationPlanId,
    quantity: number,
  ): Promise<CheckoutSessionResult>;
  /** Individual billing has no seat/quantity concept — always a quantity of one. */
  createIndividualCheckoutSession(
    userId: string,
    planId: IndividualPlanId,
  ): Promise<CheckoutSessionResult>;
  updateSubscriptionQuantity(subscriptionId: string, quantity: number): Promise<void>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  /** Verifies the raw webhook payload's signature and returns a normalized event, or `null` for an event type this gateway doesn't map. Throws `AppError` on a bad signature. */
  parseWebhookEvent(payload: string, signature: string): BillingEvent | null;
}
