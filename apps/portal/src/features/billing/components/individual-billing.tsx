"use client";

import { useMutation, useQueries } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Icons } from "@/components/icons";
import { individualBillingQueryOptions, individualPlansQueryOptions } from "../api/queries";
import { cancelIndividualSubscriptionMutation, individualCheckoutMutation } from "../api/mutations";
import { useCheckoutAttemptKey } from "../hooks/use-checkout-attempt-key";
import { BillingErrorState, BillingSkeleton } from "./billing-states";
import { CurrentPlanSummary } from "./current-plan-summary";
import { PlanOptionList } from "./plan-option-list";
import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { isLiveSubscription } from "@repo/core/billing/subscription-status";
import { UnavailableAction, pollAfterCancel } from "./billing-panel-parts";

export function IndividualBilling() {
  const checkout = useMutation(individualCheckoutMutation);
  const cancel = useMutation(cancelIndividualSubscriptionMutation);
  const [billingQuery, plansQuery] = useQueries({
    queries: [
      { ...individualBillingQueryOptions(), refetchInterval: pollAfterCancel(cancel) },
      individualPlansQueryOptions(),
    ],
  });
  const keyFor = useCheckoutAttemptKey();

  if (billingQuery.isPending || plansQuery.isPending) return <BillingSkeleton />;
  const failed = [billingQuery, plansQuery].find((q) => q.isError);
  if (failed) {
    return (
      <BillingErrorState
        message={failed.error?.message}
        retry={() => {
          billingQuery.refetch();
          plansQuery.refetch();
        }}
      />
    );
  }

  const billing = billingQuery.data!;
  const plans = plansQuery.data!.plans;
  const subscribed = isLiveSubscription(billing.subscriptionStatus);
  const awaitingCancel = cancel.isSuccess && subscribed;
  const planName = plans.find((p) => p.planId === billing.plan)?.name ?? billing.plan;

  async function startCheckout(planId: string) {
    try {
      const { checkoutUrl } = await checkout.mutateAsync({
        planId,
        idempotencyKey: keyFor(planId),
      });
      window.location.assign(checkoutUrl);
    } catch {
      // Surfaced via checkout.error below.
    }
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <CurrentPlanSummary
        planName={planName}
        status={billing.subscriptionStatus}
        action={
          subscribed && !awaitingCancel ? (
            <CancelSubscriptionButton
              onConfirm={() => cancel.mutateAsync()}
              isPending={cancel.isPending}
              error={cancel.error}
            />
          ) : undefined
        }
      />
      {awaitingCancel && (
        <p role="status" className="text-muted-foreground text-sm">
          Cancellation requested. Your plan updates here as soon as Stripe confirms it.
        </p>
      )}
      {checkout.error && (
        <Alert variant="destructive">
          <Icons.alertCircle className="size-4" />
          <AlertDescription>{checkout.error.message}</AlertDescription>
        </Alert>
      )}
      <PlanOptionList
        plans={plans}
        currentPlanId={billing.plan}
        renderAction={(plan) => {
          if (!plan.isPurchasable) {
            return <UnavailableAction>Not available for online checkout</UnavailableAction>;
          }
          if (subscribed) {
            return (
              <UnavailableAction>Cancel your current subscription to switch</UnavailableAction>
            );
          }
          const isThisPending = checkout.isPending && checkout.variables?.planId === plan.planId;
          return (
            <Button
              onClick={() => startCheckout(plan.planId)}
              disabled={checkout.isPending}
              className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isThisPending && <Spinner className="mr-2 size-4" />}
              {isThisPending ? "Redirecting…" : "Choose plan"}
            </Button>
          );
        }}
      />
    </div>
  );
}
