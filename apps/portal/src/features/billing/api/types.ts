// Mirrors apps/api's own self-service billing shapes (billing.service.ts's
// OrganizationBillingView/IndividualBillingView/OrganizationPlanOption/
// IndividualPlanOption) — the portal has no build-time dependency on apps/api, same as
// apps/admin's hand-mirrored types.ts files. SubscriptionStatus itself comes from core's
// side-effect-free subpath — it's a domain type, not an API shape to mirror.
import type { SubscriptionStatus } from "@repo/core/billing/subscription-status";

export type { SubscriptionStatus };

export interface OrganizationBilling {
  plan: string;
  subscriptionStatus: SubscriptionStatus | null;
  seatQuantity: number | null;
}

export interface IndividualBilling {
  plan: string;
  subscriptionStatus: SubscriptionStatus | null;
}

export interface OrganizationPlanOption {
  planId: string;
  name: string;
  description: string | null;
  seatLimit: number | null;
  isPurchasable: boolean;
}

export type IndividualPlanOption = Omit<OrganizationPlanOption, "seatLimit">;

export interface PlanOptionsResponse<T> {
  plans: T[];
}

export interface CheckoutResponse {
  checkoutUrl: string;
}
