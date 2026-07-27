import type { Context } from "hono";
import type { ValidatedQueryContext, ValidatedJsonContext } from "../../lib/validated-context";
import { success } from "../../lib/response";
import {
  listPlatformOrganizations,
  createPlatformOrganization,
  banPlatformOrganization,
  unbanPlatformOrganization,
} from "./platform-organizations.service";
import type {
  listPlatformOrganizationsQuerySchema,
  createPlatformOrganizationSchema,
  banPlatformOrganizationSchema,
} from "./platform-organizations.schema";

export async function listPlatformOrganizationsHandler(
  c: ValidatedQueryContext<typeof listPlatformOrganizationsQuerySchema>,
) {
  const { page, limit, search } = c.req.valid("query");
  const result = await listPlatformOrganizations({ page, limit, search });

  return success(c, result);
}

export async function createPlatformOrganizationHandler(
  c: ValidatedJsonContext<typeof createPlatformOrganizationSchema>,
) {
  const body = c.req.valid("json");
  const result = await createPlatformOrganization(body);

  return success(c, result, 201);
}

export async function banPlatformOrganizationHandler(
  c: ValidatedJsonContext<typeof banPlatformOrganizationSchema>,
) {
  // Pulled out of the same .post("/:organizationId/ban", ...) chain it's registered in
  // (per this repo's controller-handler rule), so TypeScript can't narrow param() to a
  // guaranteed string from the route pattern the way it can inline — same reason
  // ValidatedJsonContext exists for c.req.valid(). Hono guarantees this is defined at
  // runtime for a matched route (there is no unmatched-param case to guard against).
  const organizationId = c.req.param("organizationId")!;
  const { reason } = c.req.valid("json");
  await banPlatformOrganization(organizationId, reason);

  return success(c, { organizationId, suspended: true });
}

export async function unbanPlatformOrganizationHandler(c: Context) {
  const organizationId = c.req.param("organizationId")!;
  await unbanPlatformOrganization(organizationId);

  return success(c, { organizationId, suspended: false });
}
