"use client";

import { useMutation, useQueries } from "@tanstack/react-query";
import {
  organizationBillingQueryOptions,
  organizationCanManageQueryOptions,
  organizationPlansQueryOptions,
} from "../api/queries";
import { cancelOrganizationSubscriptionMutation } from "../api/mutations";
import { BillingErrorState, BillingSkeleton } from "./billing-states";
import { CurrentPlanSummary } from "./current-plan-summary";
import { PlanOptionList } from "./plan-option-list";
import { UpgradeOrganizationDialog } from "./upgrade-organization-dialog";
import { isLiveSubscription } from "@repo/core/billing/subscription-status";
import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { UnavailableAction, pollAfterCancel } from "./billing-panel-parts";

export function OrganizationBilling({
  organizationId,
  memberCount,
}: {
  organizationId: string;
  memberCount: number;
}) {
  const cancel = useMutation(cancelOrganizationSubscriptionMutation);
  const [billingQuery, plansQuery, canManageQuery] = useQueries({
    queries: [
      {
        ...organizationBillingQueryOptions(organizationId),
        refetchInterval: pollAfterCancel(cancel),
      },
      organizationPlansQueryOptions(organizationId),
      organizationCanManageQueryOptions(organizationId),
    ],
  });

  if (billingQuery.isPending || plansQuery.isPending || canManageQuery.isPending) {
    return <BillingSkeleton />;
  }
  const failed = [billingQuery, plansQuery, canManageQuery].find((q) => q.isError);
  if (failed) {
    return (
      <BillingErrorState
        message={failed.error?.message}
        retry={() => {
          billingQuery.refetch();
          plansQuery.refetch();
          canManageQuery.refetch();
        }}
      />
    );
  }

  const billing = billingQuery.data!;
  const plans = plansQuery.data!.plans;
  const canManage = canManageQuery.data!;
  const subscribed = isLiveSubscription(billing.subscriptionStatus);
  const awaitingCancel = cancel.isSuccess && subscribed;
  const planName = plans.find((p) => p.planId === billing.plan)?.name ?? billing.plan;

  return (
    <div className="flex w-full flex-col gap-6">
      <CurrentPlanSummary
        planName={planName}
        status={billing.subscriptionStatus}
        seatQuantity={billing.seatQuantity}
        action={
          canManage && subscribed && !awaitingCancel ? (
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
      {!canManage && (
        <p className="text-muted-foreground text-sm">
          Only organization owners and admins can change this organization&apos;s plan.
        </p>
      )}
      <PlanOptionList
        plans={plans}
        currentPlanId={billing.plan}
        renderAction={(plan) => {
          if (!canManage) return null;
          if (!plan.isPurchasable) {
            return <UnavailableAction>Not available for online checkout</UnavailableAction>;
          }
          // A second checkout while subscribed would start a second, separately billed
          // Stripe subscription rather than change the existing one.
          if (subscribed) {
            return (
              <UnavailableAction>Cancel your current subscription to switch</UnavailableAction>
            );
          }
          // Checkout requires at least one seat per current member, so a plan capped below
          // the team's size can't be bought without removing people first.
          if (plan.seatLimit !== null && plan.seatLimit < memberCount) {
            return (
              <UnavailableAction>
                Fits up to {plan.seatLimit} members — you have {memberCount}
              </UnavailableAction>
            );
          }
          return <UpgradeOrganizationDialog plan={plan} memberCount={memberCount} />;
        }}
      />
    </div>
  );
}
