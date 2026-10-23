import type { InferRequestType } from "hono/client";
import { unwrap } from "@repo/shared/api-response";
import { api } from "@/lib/api";

// Backed by apps/api's /subscription-plans module — the admin-editable plan catalog (see
// specs/subscription-management-plan.md). Every request/response type here is derived
// from apps/api's routes (AppType), never hand-written.
const plans = api["subscription-plans"];

type ListQuery = InferRequestType<typeof plans.$get>["query"];

// The list page's filter state — `isActive` is a real boolean here; the query string
// carries it as "true"/"false" (listSubscriptionPlansQuerySchema).
export type SubscriptionPlanFilters = {
  ownerType?: ListQuery["ownerType"];
  isActive?: boolean;
};

export type CreateSubscriptionPlanPayload = InferRequestType<typeof plans.$post>["json"];
export type UpdateSubscriptionPlanPayload = InferRequestType<
  (typeof plans)[":id"]["$patch"]
>["json"];

// `headers` only for server-side prefetches forwarding the incoming request's cookie.
export async function getSubscriptionPlans(
  filters: SubscriptionPlanFilters,
  headers?: Record<string, string>,
) {
  return unwrap(
    await plans.$get(
      {
        query: {
          ownerType: filters.ownerType,
          isActive:
            filters.isActive === undefined ? undefined : filters.isActive ? "true" : "false",
        },
      },
      { headers },
    ),
  );
}

export async function getSubscriptionPlan(id: string, headers?: Record<string, string>) {
  return unwrap(await plans[":id"].$get({ param: { id } }, { headers }));
}

export async function createSubscriptionPlan(payload: CreateSubscriptionPlanPayload) {
  return unwrap(await plans.$post({ json: payload }));
}

export async function updateSubscriptionPlan(id: string, payload: UpdateSubscriptionPlanPayload) {
  return unwrap(await plans[":id"].$patch({ param: { id }, json: payload }));
}

export type SubscriptionPlan = Awaited<ReturnType<typeof getSubscriptionPlans>>["plans"][number];
export type SubscriptionPlanDetail = Awaited<ReturnType<typeof getSubscriptionPlan>>;
