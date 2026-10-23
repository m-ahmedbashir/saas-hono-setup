import type { InferRequestType } from "hono/client";
import { unwrap } from "@repo/shared/api-response";
import { api } from "@/lib/api";

// Backed by apps/api's /platform-organizations route, not Better Auth's organization plugin
// — that plugin's /organization/list is scoped to the caller's own memberships; this is a
// platform-staff view of every organization (specs/platform-organizations.md). Every
// request/response type here is derived from apps/api's routes (AppType), never hand-written.
const organizations = api["platform-organizations"];

// The list page's paging/search state; the query string carries it as text.
export type PlatformOrganizationFilters = {
  page?: number;
  limit?: number;
  search?: string;
};

export type CreatePlatformOrganizationPayload = InferRequestType<
  typeof organizations.$post
>["json"];

export type BanOrganizationPayload = { organizationId: string } & InferRequestType<
  (typeof organizations)[":organizationId"]["ban"]["$post"]
>["json"];

// `headers` only for server-side prefetches forwarding the incoming request's cookie.
export async function getPlatformOrganizations(
  filters: PlatformOrganizationFilters,
  headers?: Record<string, string>,
) {
  return unwrap(
    await organizations.$get(
      {
        query: {
          page: filters.page ? String(filters.page) : undefined,
          limit: filters.limit ? String(filters.limit) : undefined,
          search: filters.search || undefined,
        },
      },
      { headers },
    ),
  );
}

export async function createPlatformOrganization(payload: CreatePlatformOrganizationPayload) {
  return unwrap(await organizations.$post({ json: payload }));
}

export async function banOrganization(organizationId: string, reason?: string) {
  return unwrap(
    await organizations[":organizationId"].ban.$post({
      param: { organizationId },
      json: { reason },
    }),
  );
}

export async function unbanOrganization(organizationId: string) {
  return unwrap(await organizations[":organizationId"].unban.$post({ param: { organizationId } }));
}

export async function getPlatformOrganizationDetail(
  organizationId: string,
  headers?: Record<string, string>,
) {
  return unwrap(
    await organizations[":organizationId"].$get({ param: { organizationId } }, { headers }),
  );
}

export type PlatformOrganization = Awaited<
  ReturnType<typeof getPlatformOrganizations>
>["organizations"][number];
export type PlatformOrganizationDetail = Awaited<ReturnType<typeof getPlatformOrganizationDetail>>;
export type PlatformOrganizationMember = PlatformOrganizationDetail["members"][number];
export type PlatformOrganizationInvoice = PlatformOrganizationDetail["invoices"][number];
