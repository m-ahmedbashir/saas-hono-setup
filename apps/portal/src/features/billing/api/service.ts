import { unwrap } from "@repo/shared/api-response";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// None of these take an org/user id — apps/api resolves both from the session cookie, so
// there is no request shape here that could address someone else's billing. Return types
// are inferred from apps/api's routes (AppType) — never hand-written.

export async function getOrganizationBilling() {
  return unwrap(await api.billing.organization.$get());
}

export async function getIndividualBilling() {
  return unwrap(await api.billing.individual.$get());
}

export async function getOrganizationPlans() {
  return unwrap(await api.billing["organization-plans"].$get());
}

export async function getIndividualPlans() {
  return unwrap(await api.billing["individual-plans"].$get());
}

// Named for components that take one plan as a prop — derived, so it follows the server.
export type OrganizationPlanOption = Awaited<
  ReturnType<typeof getOrganizationPlans>
>["plans"][number];

// idempotencyKey is required, not optional — see use-checkout-attempt-key.ts for why the
// caller owns its lifetime (one key per logical attempt, specs/billing-integrity-plan.md Fix 2).
export async function createOrganizationCheckout(input: {
  planId: string;
  quantity: number;
  idempotencyKey: string;
}) {
  return unwrap(
    await api.billing["organization-checkout"].$post(
      { json: { planId: input.planId, quantity: input.quantity } },
      { headers: { "Idempotency-Key": input.idempotencyKey } },
    ),
  );
}

export async function createIndividualCheckout(input: { planId: string; idempotencyKey: string }) {
  return unwrap(
    await api.billing["individual-checkout"].$post(
      { json: { planId: input.planId } },
      { headers: { "Idempotency-Key": input.idempotencyKey } },
    ),
  );
}

export async function cancelOrganizationSubscription() {
  return unwrap(await api.billing["organization-cancel"].$post());
}

export async function cancelIndividualSubscription() {
  return unwrap(await api.billing["individual-cancel"].$post());
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
