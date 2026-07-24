import type { Context } from "hono";
import { requireOrgContext } from "../../middleware/auth.middleware";
import { success } from "../../lib/response";
import type { ValidatedJsonContext } from "../../lib/validated-context";
import { billingService } from "./stripe-billing.service";
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
  const { checkoutUrl } = await billingService.createCheckoutSession(
    userContext.organizationId,
    planId,
    quantity,
  );

  return success(c, { checkoutUrl });
}

export async function individualCheckoutHandler(
  c: ValidatedJsonContext<typeof individualCheckoutRequestSchema>,
) {
  const userContext = c.get("userContext");
  const { planId } = c.req.valid("json");
  const { checkoutUrl } = await billingService.createIndividualCheckoutSession(
    userContext.user.id,
    planId,
  );

  return success(c, { checkoutUrl });
}

export async function webhookRequestHandler(c: Context) {
  const signature = c.req.header("stripe-signature");
  const payload = await c.req.text();
  await processWebhook(payload, signature);

  return c.json({ received: true });
}
