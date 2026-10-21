import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@repo/shared/query-client";
import {
  cancelIndividualSubscription,
  cancelOrganizationSubscription,
  createIndividualCheckout,
  createOrganizationCheckout,
} from "./service";
import { billingKeys } from "./queries";

const invalidateBilling = () => {
  getQueryClient().invalidateQueries({ queryKey: billingKeys.all });
};

// No cache invalidation on checkout — success means navigating away to Stripe's hosted
// page; the return trip (?checkout=success) refetches instead.
export const organizationCheckoutMutation = mutationOptions({
  mutationFn: createOrganizationCheckout,
});

export const individualCheckoutMutation = mutationOptions({
  mutationFn: createIndividualCheckout,
});

// The cancel routes only call Stripe; the local subscriptionStatus changes when Stripe's
// webhook lands (billing.service.ts's cancel comment), so this refetch may briefly still
// read "active" — the UI says so rather than pretending the change is instant.
export const cancelOrganizationSubscriptionMutation = mutationOptions({
  mutationFn: cancelOrganizationSubscription,
  onSettled: (_data, error) => {
    if (!error) invalidateBilling();
  },
});

export const cancelIndividualSubscriptionMutation = mutationOptions({
  mutationFn: cancelIndividualSubscription,
  onSettled: (_data, error) => {
    if (!error) invalidateBilling();
  },
});
