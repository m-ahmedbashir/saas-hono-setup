import type { Context } from "hono";
import { requireOrgContext } from "../../middleware/auth.middleware";
import { success } from "../../lib/response";
import type { ValidatedJsonContext } from "../../lib/validated-context";
import {
  createOrganizationCheckout,
  createIndividualCheckout,
  getOrganizationBillingView,
  getIndividualBillingView,
  cancelOrganizationSubscription,
  cancelIndividualSubscription,
} from "./billing.service";
import { processWebhook } from "./billing.handlers";
import type { checkoutRequestSchema, individualCheckoutRequestSchema } from "./billing.schema";

export async function organizationCheckoutHandler(
  c: ValidatedJsonContext<typeof checkoutRequestSchema>,
) {
  const userContext = requireOrgContext(
    c.get("userContext"),
    "Checkout requires an active organization",
  );
  const { planId, quantity } = c.req.valid("json");
  const { checkoutUrl } = await createOrganizationCheckout(
    userContext.organizationId,
    planId,
    quantity,
    c.req.header("Idempotency-Key"),
  );

  return success(c, { checkoutUrl });
}

export async function individualCheckoutHandler(
  c: ValidatedJsonContext<typeof individualCheckoutRequestSchema>,
) {
  const userContext = c.get("userContext");
  const { planId } = c.req.valid("json");
  const { checkoutUrl } = await createIndividualCheckout(
    userContext.user.id,
    planId,
    c.req.header("Idempotency-Key"),
  );

  return success(c, { checkoutUrl });
}

export async function getOrganizationBillingHandler(c: Context) {
  const userContext = requireOrgContext(c.get("userContext"));
  const view = await getOrganizationBillingView(userContext.organizationId);

  return success(c, view);
}

// No requireOrgContext/requirePermission — ownership-based, same reasoning as
// individualCheckoutHandler above. Works identically for B2C and B2B2C sessions.
export async function getIndividualBillingHandler(c: Context) {
  const userContext = c.get("userContext");
  const view = await getIndividualBillingView(userContext.user.id);

  return success(c, view);
}

export async function cancelOrganizationBillingHandler(c: Context) {
  const userContext = requireOrgContext(c.get("userContext"));
  await cancelOrganizationSubscription(userContext.organizationId);

  return success(c, { canceled: true });
}

export async function cancelIndividualBillingHandler(c: Context) {
  const userContext = c.get("userContext");
  await cancelIndividualSubscription(userContext.user.id);

  return success(c, { canceled: true });
}

export async function webhookRequestHandler(c: Context) {
  const signature = c.req.header("stripe-signature");
  const payload = await c.req.text();
  await processWebhook(payload, signature);

  return c.json({ received: true });
}
