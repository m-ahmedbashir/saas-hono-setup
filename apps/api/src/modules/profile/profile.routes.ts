import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { updateProfileSchema } from "./profile.schema";
import { getProfileHandler, updateProfileHandler } from "./profile.controller";

// zValidator's own failure response doesn't match our envelope, so the hook re-throws
// through AppError/app.onError instead — every failure still goes through one place.
const validateUpdateProfileBody = zValidator("json", updateProfileSchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid profile update", flattenError(result.error));
  }
});

// No requirePermission/requireOrgContext on purpose — a profile is the user's own,
// an ownership concept, not an org-role one. Works identically for a B2C or B2B2C
// session, same reasoning as /billing/individual-checkout.
export const profileRoutes = new Hono()
  .get("/", injectUserContext, getProfileHandler)
  .patch("/", injectUserContext, validateUpdateProfileBody, updateProfileHandler);
