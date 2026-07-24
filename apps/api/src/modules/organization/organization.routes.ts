import { Hono } from "hono";
import { injectUserContext } from "../../middleware/auth.middleware";
import { requirePermission } from "../../middleware/permission.middleware";
import { deleteOrganizationHandler } from "./organization.controller";

// Owner-only — deleting the entire organization (and every member's access to it) is
// more severe than organizationProfile:manage (owner+admin) covers, so this gets its
// own, stricter permission. Operates on the caller's active org, same as
// /organization-profile — no :orgId path param.
export const organizationRoutes = new Hono().delete(
  "/",
  injectUserContext,
  requirePermission({ organization: ["delete"] }),
  deleteOrganizationHandler,
);
