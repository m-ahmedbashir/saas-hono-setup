// Organization lifecycle calls that Better Auth's organization plugin already serves —
// permission-checked server side (packages/core's auth config), same reasoning as the
// team feature's service. Calls to apps/api's own routes use the typed `api` client.
import type { InferRequestType } from "hono/client";
import { unwrap } from "@repo/shared/api-response";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { AuthActionError, describeAuthError, unwrapAuthResult } from "@/lib/auth-action";
import { slugCandidates, slugify } from "../lib/slug";

const SLUG_TAKEN = "ORGANIZATION_SLUG_ALREADY_TAKEN";

// check-slug answers "taken" with an error, not `status: false` (verified in the installed
// 1.7.12 crud-org.mjs). Create re-checks server side, so a slug taken between the two
// calls still fails cleanly (ORGANIZATION_ALREADY_EXISTS) rather than creating a duplicate.
async function findFreeSlug(name: string): Promise<string> {
  for (const slug of slugCandidates(slugify(name))) {
    const { error } = await authClient.organization.checkSlug({ slug });
    if (!error) return slug;
    if (error.code !== SLUG_TAKEN) {
      throw new AuthActionError(error.message ?? "Could not check the name", error.code);
    }
  }
  throw new AuthActionError("No free slug found", SLUG_TAKEN);
}

export async function createOrganization(input: { name: string }) {
  const slug = await findFreeSlug(input.name);
  return unwrapAuthResult(await authClient.organization.create({ name: input.name, slug }));
}

const couldNotCreate = "We couldn't create that organization just now. Please try again.";

const friendlyMessages: Record<string, string> = {
  YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_ORGANIZATION:
    "Only owners and admins can change organization settings.",
  // Slugs are never shown, so a slug clash is our problem to explain, not the user's.
  ORGANIZATION_ALREADY_EXISTS: couldNotCreate,
  [SLUG_TAKEN]: couldNotCreate,
};

export function describeOrganizationError(error: Error): string {
  return describeAuthError(error, friendlyMessages);
}

// Better Auth's /organization/update checks organization:update (owner+admin) server side.
export async function renameOrganization(input: { organizationId: string; name: string }) {
  return unwrapAuthResult(
    await authClient.organization.update({
      organizationId: input.organizationId,
      data: { name: input.name },
    }),
  );
}

// apps/api resolves the organization from the session — there's no id to send, so this
// can't address another org's profile. Types come from AppType, never hand-written.
export async function getOrganizationProfile() {
  return unwrap(await api["organization-profile"].$get());
}

export type OrganizationProfile = Awaited<ReturnType<typeof getOrganizationProfile>>;

export type OrganizationProfileUpdate = InferRequestType<
  (typeof api)["organization-profile"]["$patch"]
>["json"];

export async function updateOrganizationProfile(json: OrganizationProfileUpdate) {
  return unwrap(await api["organization-profile"].$patch({ json }));
}
