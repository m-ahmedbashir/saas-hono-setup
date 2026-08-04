import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import { AppError } from "@repo/core";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePlatformPermission } from "../../middleware/platform-permission.middleware";
import { listPlatformIndividualsQuerySchema } from "./platform-individuals.schema";
import {
  listPlatformIndividualsHandler,
  getPlatformIndividualDetailHandler,
} from "./platform-individuals.controller";

// Same re-throw-through-AppError pattern as every other validated route in this repo
// (zValidator's own failure shape doesn't match our { success, error } envelope).
const validateListQuery = zValidator("query", listPlatformIndividualsQuerySchema, (result) => {
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters", flattenError(result.error));
  }
});

// Platform-wide, not org-scoped — no requireOrgContext on either route, same
// reasoning as platform-organizations. Reuses the existing `user: ["list"]` platform
// permission (packages/core/src/auth/platform-permissions.ts) rather than a new
// resource — already granted to both admin and support for Better Auth's own
// admin.listUsers, and semantically it's the same capability ("list user accounts
// platform-wide"), just a different query shape here.
export const platformIndividualsRoutes = new Hono()
  .get(
    "/",
    injectUserContext,
    requirePlatformPermission({ user: ["list"] }),
    validateListQuery,
    listPlatformIndividualsHandler,
  )
  .get(
    "/:userId",
    injectUserContext,
    requirePlatformPermission({ user: ["list"] }),
    getPlatformIndividualDetailHandler,
  );
