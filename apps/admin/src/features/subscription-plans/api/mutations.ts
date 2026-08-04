import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { createSubscriptionPlan, updateSubscriptionPlan } from "./service";
import { subscriptionPlanKeys } from "./queries";
import type { CreateSubscriptionPlanPayload, UpdateSubscriptionPlanPayload } from "./types";

const invalidateSubscriptionPlans = () => {
  getQueryClient().invalidateQueries({ queryKey: subscriptionPlanKeys.all });
};

export const createSubscriptionPlanMutation = mutationOptions({
  mutationFn: (payload: CreateSubscriptionPlanPayload) => createSubscriptionPlan(payload),
  onSettled: (_data, error) => {
    if (!error) invalidateSubscriptionPlans();
  },
});

export const updateSubscriptionPlanMutation = mutationOptions({
  mutationFn: ({ id, payload }: { id: string; payload: UpdateSubscriptionPlanPayload }) =>
    updateSubscriptionPlan(id, payload),
  onSettled: (_data, error) => {
    if (!error) invalidateSubscriptionPlans();
  },
});
