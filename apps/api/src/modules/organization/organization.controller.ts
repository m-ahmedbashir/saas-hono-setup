import type { Context } from "hono";
import { requireOrgContext } from "../../middleware/auth.middleware";
import { success } from "../../lib/response";
import { deleteOrganization } from "./organization.service";

export async function deleteOrganizationHandler(c: Context) {
  const userContext = requireOrgContext(c.get("userContext"));
  await deleteOrganization(userContext.organizationId);

  return success(c, { deleted: true });
}
