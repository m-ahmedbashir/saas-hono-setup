import { queryOptions } from "@tanstack/react-query";
import { getSubscriptionPlans, getSubscriptionPlan } from "./service";
import type { SubscriptionPlan, SubscriptionPlanFilters } from "./types";

export type { SubscriptionPlan };

export const subscriptionPlanKeys = {
  all: ["subscription-plans"] as const,
  list: (filters: SubscriptionPlanFilters) =>
    [...subscriptionPlanKeys.all, "list", filters] as const,
  detail: (id: string) => [...subscriptionPlanKeys.all, "detail", id] as const,
};

export const subscriptionPlansQueryOptions = (
  filters: SubscriptionPlanFilters,
  headers?: HeadersInit,
) =>
  queryOptions({
    queryKey: subscriptionPlanKeys.list(filters),
    queryFn: () => getSubscriptionPlans(filters, headers),
  });

// Client-only (no SSR prefetch) — only fetched when the edit sheet opens, to grab
// activeSubscriberCount for the price-change warning banner (item 5). The row data the
// table already has covers every other field the sheet needs.
export const subscriptionPlanDetailQueryOptions = (id: string) =>
  queryOptions({
    queryKey: subscriptionPlanKeys.detail(id),
    queryFn: () => getSubscriptionPlan(id),
  });
