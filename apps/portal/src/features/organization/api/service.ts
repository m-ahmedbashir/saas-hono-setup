// Organization lifecycle calls that Better Auth's organization plugin already serves —
// permission-checked server side (packages/core's auth config), same reasoning as the
// team feature's service. Calls to apps/api's own routes use the typed `api` client.
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
  // Slugs are never shown, so a slug clash is our problem to explain, not the user's.
  ORGANIZATION_ALREADY_EXISTS: couldNotCreate,
  [SLUG_TAKEN]: couldNotCreate,
};

export function describeOrganizationError(error: Error): string {
  return describeAuthError(error, friendlyMessages);
}
