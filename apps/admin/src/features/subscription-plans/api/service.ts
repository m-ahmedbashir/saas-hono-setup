import { apiFetch } from "@/lib/api-client";
import type {
  SubscriptionPlan,
  SubscriptionPlanDetail,
  SubscriptionPlanFilters,
  SubscriptionPlansResponse,
  CreateSubscriptionPlanPayload,
  UpdateSubscriptionPlanPayload,
} from "./types";

export async function getSubscriptionPlans(
  filters: SubscriptionPlanFilters,
  headers?: HeadersInit,
): Promise<SubscriptionPlansResponse> {
  const params = new URLSearchParams();
  if (filters.ownerType) params.set("ownerType", filters.ownerType);
  if (filters.isActive !== undefined) params.set("isActive", String(filters.isActive));
  const query = params.toString();

  return apiFetch<SubscriptionPlansResponse>(`/subscription-plans${query ? `?${query}` : ""}`, {
    headers,
  });
}

export async function getSubscriptionPlan(
  id: string,
  headers?: HeadersInit,
): Promise<SubscriptionPlanDetail> {
  return apiFetch<SubscriptionPlanDetail>(`/subscription-plans/${id}`, { headers });
}

export async function createSubscriptionPlan(
  payload: CreateSubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  return apiFetch<SubscriptionPlan>("/subscription-plans", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateSubscriptionPlan(
  id: string,
  payload: UpdateSubscriptionPlanPayload,
): Promise<SubscriptionPlan> {
  return apiFetch<SubscriptionPlan>(`/subscription-plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}
