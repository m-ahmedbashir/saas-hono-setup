import { Hono } from "hono";
import { injectUserContext } from "../../middleware/auth.middleware";
import { deleteAccountHandler } from "./account.controller";

// No requirePermission/requireOrgContext — deleting your own account is an ownership
// concept, same reasoning as /profile and /billing/individual-checkout. Works
// identically for a B2C or B2B2C session; the sole-owner-of-a-multi-member-org guard
// lives in account.service.ts, not here.
export const accountRoutes = new Hono().delete("/", injectUserContext, deleteAccountHandler);
