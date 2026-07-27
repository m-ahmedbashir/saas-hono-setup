import type { Context } from "hono";
import type { ValidatedQueryContext } from "../../lib/validated-context";
import { success } from "../../lib/response";
import {
  listPlatformIndividuals,
  getPlatformIndividualDetail,
} from "./platform-individuals.service";
import type { listPlatformIndividualsQuerySchema } from "./platform-individuals.schema";

export async function listPlatformIndividualsHandler(
  c: ValidatedQueryContext<typeof listPlatformIndividualsQuerySchema>,
) {
  const { page, limit, search, plan, subscriptionStatus, hasOrganization } = c.req.valid("query");
  const result = await listPlatformIndividuals({
    page,
    limit,
    search,
    plan,
    subscriptionStatus,
    hasOrganization,
  });

  return success(c, result);
}

export async function getPlatformIndividualDetailHandler(c: Context) {
  // Pulled out of the same .get("/:userId", ...) chain it's registered in, so
  // TypeScript can't narrow param() to a guaranteed string the way it can inline —
  // same reasoning as platform-organizations.controller.ts's identical comment. Hono
  // guarantees this is defined at runtime for a matched route.
  const userId = c.req.param("userId")!;
  const result = await getPlatformIndividualDetail(userId);

  return success(c, result);
}
