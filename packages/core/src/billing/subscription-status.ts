import type { SubscriptionStatus } from "./types";

export type { SubscriptionStatus };

/**
 * Whether a billing row's status still points at a Stripe subscription that exists and
 * bills (or is being retried — `past_due`, or `incomplete` awaiting first payment). The
 * one definition shared by checkout (no second subscription while one is live), cancel
 * (nothing live to cancel), and apps/portal's billing UI — so the three can't disagree.
 * `null` = never subscribed. Pure and dependency-free, so client code can import it via
 * the `@repo/core/billing/subscription-status` subpath without pulling in the DB.
 */
export function isLiveSubscription(status: SubscriptionStatus | null): boolean {
  return status !== null && status !== "canceled";
}
