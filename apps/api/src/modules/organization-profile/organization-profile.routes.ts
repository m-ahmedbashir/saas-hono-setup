import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/permission.middleware";
import { updateOrganizationProfileSchema } from "./organization-profile.schema";
import {
  getOrganizationProfileHandler,
  updateOrganizationProfileHandler,
} from "./organization-profile.controller";

// zValidator's own failure response doesn't match our envelope, so the hook re-throws
// through AppError/app.onError instead — every failure still goes through one place.
const validateUpdateOrganizationProfileBody = zValidator(
  "json",
  updateOrganizationProfileSchema,
  (result) => {
    if (!result.success) {
      throw new AppError(
        "VALIDATION_ERROR",
        "Invalid organization profile update",
        flattenError(result.error),
      );
    }
  },
);

export const organizationProfileRoutes = new Hono()
  // Any member of the active org can view — this is org-shared reference info
  // (industry, address, tax ID, the org's number), not a role-gated action.
  .get("/", injectUserContext, getOrganizationProfileHandler)
  // Owner/admin only — a real permission, not billing's, since editing org profile
  // fields is a distinct concern (ISP: don't gate on an unrelated permission).
  .patch(
    "/",
    injectUserContext,
    requirePermission({ organizationProfile: ["manage"] }),
    validateUpdateOrganizationProfileBody,
    updateOrganizationProfileHandler,
  );
