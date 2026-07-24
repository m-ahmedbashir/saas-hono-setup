import type { Context } from "hono";
import { requireOrgContext } from "../../middleware/auth.middleware";
import { success } from "../../lib/response";
import type { ValidatedJsonContext } from "../../lib/validated-context";
import { getOrganizationProfile, updateOrganizationProfile } from "./organization-profile.service";
import type { updateOrganizationProfileSchema } from "./organization-profile.schema";

export async function getOrganizationProfileHandler(c: Context) {
  const userContext = requireOrgContext(c.get("userContext"));
  const profile = await getOrganizationProfile(userContext.organizationId);

  return success(c, profile);
}

export async function updateOrganizationProfileHandler(
  c: ValidatedJsonContext<typeof updateOrganizationProfileSchema>,
) {
  const userContext = requireOrgContext(c.get("userContext"));
  const body = c.req.valid("json");
  const profile = await updateOrganizationProfile(userContext.organizationId, body);

  return success(c, profile);
}
