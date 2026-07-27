import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePlatformPermission } from "../../middleware/platform-permission.middleware";
import {
  listPlatformOrganizationsQuerySchema,
  createPlatformOrganizationSchema,
} from "./platform-organizations.schema";
import {
  listPlatformOrganizationsHandler,
  createPlatformOrganizationHandler,
} from "./platform-organizations.controller";

// Same re-throw-through-AppError pattern as every other validated route in this repo
// (zValidator's own failure shape doesn't match our { success, error } envelope).
const validateListQuery = zValidator("query", listPlatformOrganizationsQuerySchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", flattenError(result.error));
  }
});

const validateCreateBody = zValidator("json", createPlatformOrganizationSchema, (result) => {
  if (!result.success) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Invalid organization payload",
      flattenError(result.error),
    );
  }
});

// Platform-wide, not org-scoped — no requireOrgContext on either route. GET
// deliberately lists every organization regardless of which (if any) is the caller's
// active org; POST provisions a new organization + owner for a company that isn't a
// member of anything yet, so there's no active org to require in the first place.
export const platformOrganizationsRoutes = new Hono()
  .get(
    "/",
    injectUserContext,
    requirePlatformPermission({ organization: ["list"] }),
    validateListQuery,
    listPlatformOrganizationsHandler,
  )
  .post(
    "/",
    injectUserContext,
    requirePlatformPermission({ organization: ["create"] }),
    validateCreateBody,
    createPlatformOrganizationHandler,
  );
