import type { Context } from "hono";
import type { ValidatedJsonContext, ValidatedQueryContext } from "../../lib/validated-context";
import { success } from "../../lib/response";
import {
  listPlans,
  getPlanWithSubscriberCount,
  createPlan,
  updatePlan,
} from "./subscription-plans.service";
import type {
  listSubscriptionPlansQuerySchema,
  createSubscriptionPlanSchema,
  updateSubscriptionPlanSchema,
} from "./subscription-plans.schema";

export async function listSubscriptionPlansHandler(
  c: ValidatedQueryContext<typeof listSubscriptionPlansQuerySchema>,
) {
  const { ownerType, isActive } = c.req.valid("query");
  const plans = await listPlans({ ownerType, isActive });

  return success(c, { plans });
}

export async function getSubscriptionPlanHandler(c: Context) {
  // Pulled out of the same .get("/:id", ...) chain it's registered in, so TypeScript
  // can't narrow param() to a guaranteed string the way it can inline — same reasoning
  // as platform-individuals.controller.ts's identical comment. Hono guarantees this is
  // defined at runtime for a matched route.
  const id = c.req.param("id")!;
  const plan = await getPlanWithSubscriberCount(id);

  return success(c, plan);
}

export async function createSubscriptionPlanHandler(
  c: ValidatedJsonContext<typeof createSubscriptionPlanSchema>,
) {
  const input = c.req.valid("json");
  const plan = await createPlan(input);

  return success(c, plan);
}

export async function updateSubscriptionPlanHandler(
  c: ValidatedJsonContext<typeof updateSubscriptionPlanSchema>,
) {
  const id = c.req.param("id")!;
  const input = c.req.valid("json");
  const plan = await updatePlan(id, input);

  return success(c, plan);
}
