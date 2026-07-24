import type { Context } from "hono";
import { requireOrgContext } from "../../middleware/auth.middleware";
import { success } from "../../lib/response";
import { billingService } from "./stripe-billing.service";
import { processWebhook } from "./billing.handlers";
import type { checkoutRequestSchema, individualCheckoutRequestSchema } from "./billing.schema";
import type { z } from "zod";

// Reconstructs the exact `{ in, out }` shape @hono/zod-validator's zValidator produces
// for a given schema on the "json" target (see its DefaultInput type) — needed because
// pulling a handler out of the same .post(path, validator, handler) chain it's validated
// in loses TypeScript's contextual inference for c.req.valid(); a plain `Context` types
// .valid() as unusable. Keeps the validator itself in billing.routes.ts, per AGENTS.md.
type ValidatedJsonContext<Schema extends z.ZodType> = Context<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  any,
  string,
  { in: { json: z.input<Schema> }; out: { json: z.output<Schema> } }
>;

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
