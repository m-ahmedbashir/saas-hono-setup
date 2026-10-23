import { unwrap } from "@repo/shared/api-response";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";

// Backed by apps/api's /platform-individuals route — the complement of the platform Users
// (staff) page: every account that ISN'T admin/support (specs/platform-individuals.md).
// Every apps/api request/response type here is derived from its routes (AppType), never
// hand-written; ban/unban below are Better Auth calls with no data to type.
const individuals = api["platform-individuals"];

export type PlatformIndividualFilters = {
  page?: number;
  limit?: number;
  search?: string;
  // Comma-separated when multiple facet values are picked — apps/api's
  // platform-individuals.schema.ts splits on "," before validating each member.
  plan?: string;
  subscriptionStatus?: string;
  hasOrganization?: boolean;
};

// `headers` only for server-side prefetches forwarding the incoming request's cookie.
export async function getPlatformIndividuals(
  filters: PlatformIndividualFilters,
  headers?: Record<string, string>,
) {
  return unwrap(
    await individuals.$get(
      {
        query: {
          page: filters.page ? String(filters.page) : undefined,
          limit: filters.limit ? String(filters.limit) : undefined,
          search: filters.search || undefined,
          plan: filters.plan || undefined,
          subscriptionStatus: filters.subscriptionStatus || undefined,
          hasOrganization:
            filters.hasOrganization === undefined
              ? undefined
              : filters.hasOrganization
                ? "true"
                : "false",
        },
      },
      { headers },
    ),
  );
}

export async function getPlatformIndividualDetail(
  userId: string,
  headers?: Record<string, string>,
) {
  return unwrap(await individuals[":userId"].$get({ param: { userId } }, { headers }));
}

export type PlatformIndividual = Awaited<
  ReturnType<typeof getPlatformIndividuals>
>["individuals"][number];
export type PlatformIndividualDetail = Awaited<ReturnType<typeof getPlatformIndividualDetail>>;
export type PlatformIndividualOrganization = PlatformIndividualDetail["organizations"][number];

// Real Better Auth ban/unban — authClient.admin.* directly, no apps/api route. Better
// Auth's admin plugin already works on any user id regardless of role (immediately
// revokes sessions, verified in AGENTS.md's Platform admin section), so there's
// nothing custom to build here — same call the existing Users (staff) table's row
// action already makes. Unlike platform-organizations' ban, this is real enforcement
// from day one, not a flag.
function unwrapAuthResult<T>(result: { data: T | null; error: { message?: string } | null }): T {
  if (result.error) {
    throw new Error(result.error.message ?? "Request failed");
  }
  if (result.data === null) {
    throw new Error("Request returned no data");
  }
  return result.data;
}

export async function banIndividual(userId: string, banReason?: string): Promise<void> {
  const result = await authClient.admin.banUser({ userId, banReason });
  unwrapAuthResult(result);
}

export async function unbanIndividual(userId: string): Promise<void> {
  const result = await authClient.admin.unbanUser({ userId });
  unwrapAuthResult(result);
}
