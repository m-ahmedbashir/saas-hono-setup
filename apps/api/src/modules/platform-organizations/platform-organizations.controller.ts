import type { ValidatedQueryContext, ValidatedJsonContext } from "../../lib/validated-context";
import { success } from "../../lib/response";
import {
  listPlatformOrganizations,
  createPlatformOrganization,
} from "./platform-organizations.service";
import type {
  listPlatformOrganizationsQuerySchema,
  createPlatformOrganizationSchema,
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
