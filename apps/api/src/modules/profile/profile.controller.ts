import type { Context } from "hono";
import { success } from "../../lib/response";
import type { ValidatedJsonContext } from "../../lib/validated-context";
import { getProfile, updateProfile } from "./profile.service";
import type { updateProfileSchema } from "./profile.schema";

export async function getProfileHandler(c: Context) {
  const userContext = c.get("userContext");
  const profile = await getProfile(userContext.user.id);

  return success(c, profile);
}

export async function updateProfileHandler(c: ValidatedJsonContext<typeof updateProfileSchema>) {
  const userContext = c.get("userContext");
  const body = c.req.valid("json");
  const profile = await updateProfile(userContext.user.id, body);

  return success(c, profile);
}
