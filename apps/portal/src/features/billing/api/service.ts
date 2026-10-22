import { apiFetch } from "@repo/shared/api-client";
import { authClient } from "@/lib/auth-client";
import type {
  CheckoutResponse,
  IndividualBilling,
  IndividualPlanOption,
  OrganizationBilling,
  OrganizationPlanOption,
  PlanOptionsResponse,
} from "./types";

// None of these take an org/user id — apps/api resolves both from the session cookie, so
// there is no request shape here that could address someone else's billing.

export function getOrganizationBilling(): Promise<OrganizationBilling> {
  return apiFetch<OrganizationBilling>("/billing/organization");
}

export function getIndividualBilling(): Promise<IndividualBilling> {
  return apiFetch<IndividualBilling>("/billing/individual");
}

export function getOrganizationPlans(): Promise<PlanOptionsResponse<OrganizationPlanOption>> {
  return apiFetch<PlanOptionsResponse<OrganizationPlanOption>>("/billing/organization-plans");
}

export function getIndividualPlans(): Promise<PlanOptionsResponse<IndividualPlanOption>> {
  return apiFetch<PlanOptionsResponse<IndividualPlanOption>>("/billing/individual-plans");
}

// idempotencyKey is required, not optional — see use-checkout-attempt-key.ts for why the
// caller owns its lifetime (one key per logical attempt, specs/billing-integrity-plan.md Fix 2).
export function createOrganizationCheckout(input: {
  planId: string;
  quantity: number;
  idempotencyKey: string;
}): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/billing/organization-checkout", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ planId: input.planId, quantity: input.quantity }),
  });
}

export function createIndividualCheckout(input: {
  planId: string;
  idempotencyKey: string;
}): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>("/billing/individual-checkout", {
    method: "POST",
    headers: { "Idempotency-Key": input.idempotencyKey },
    body: JSON.stringify({ planId: input.planId }),
  });
}

export function cancelOrganizationSubscription(): Promise<{ canceled: true }> {
  return apiFetch<{ canceled: true }>("/billing/organization-cancel", { method: "POST" });
}

export function cancelIndividualSubscription(): Promise<{ canceled: true }> {
  return apiFetch<{ canceled: true }>("/billing/individual-cancel", { method: "POST" });
}

// Asks apps/api (Better Auth's own /organization/has-permission, backed by the same
// `roles` map requirePermission uses) rather than comparing role names client-side — so
// this can never drift from what the server will actually allow. UX gating only; the
// checkout/cancel routes enforce billing:manage themselves regardless.
export async function canManageOrganizationBilling(): Promise<boolean> {
  const { data, error } = await authClient.organization.hasPermission({
    permissions: { billing: ["manage"] },
  });
  if (error) throw new Error(error.message ?? "Failed to check billing permission");
  return data?.success ?? false;
}
