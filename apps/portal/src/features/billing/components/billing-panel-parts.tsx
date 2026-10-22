import { isLiveSubscription } from "@repo/core/billing/subscription-status";
import type { SubscriptionStatus } from "../api/types";

const CONFIRMATION_POLL_MS = 2_000;
const CONFIRMATION_TIMEOUT_MS = 60_000;

/**
 * `refetchInterval` for a billing query after a cancel request. The API only asks Stripe
 * to cancel; the local status changes when Stripe's webhook lands, usually a few seconds
 * later — so a single refetch right after the request still reads "active". Polls until
 * the status stops being live, giving up after a minute (e.g. no webhook in local dev).
 */
export function pollAfterCancel(cancel: { isSuccess: boolean; submittedAt: number }) {
  return (query: { state: { data?: { subscriptionStatus: SubscriptionStatus | null } } }) =>
    cancel.isSuccess &&
    isLiveSubscription(query.state.data?.subscriptionStatus ?? null) &&
    Date.now() - cancel.submittedAt < CONFIRMATION_TIMEOUT_MS
      ? CONFIRMATION_POLL_MS
      : false;
}

export function UnavailableAction({ children }: { children: React.ReactNode }) {
  return <p className="text-muted-foreground max-w-56 text-sm sm:text-right">{children}</p>;
}
