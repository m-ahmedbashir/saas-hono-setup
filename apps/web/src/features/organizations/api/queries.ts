import { queryOptions } from "@tanstack/react-query";
import { getPlatformOrganizations, getPlatformOrganizationDetail } from "./service";
import type { PlatformOrganization, PlatformOrganizationFilters } from "./types";

export type { PlatformOrganization };

export const platformOrganizationKeys = {
  all: ["platform-organizations"] as const,
  list: (filters: PlatformOrganizationFilters) =>
    [...platformOrganizationKeys.all, "list", filters] as const,
  detail: (organizationId: string) =>
    [...platformOrganizationKeys.all, "detail", organizationId] as const,
};

export const platformOrganizationsQueryOptions = (
  filters: PlatformOrganizationFilters,
  headers?: HeadersInit,
) =>
  queryOptions({
    queryKey: platformOrganizationKeys.list(filters),
    queryFn: () => getPlatformOrganizations(filters, headers),
  });

export const platformOrganizationDetailQueryOptions = (
  organizationId: string,
  headers?: HeadersInit,
) =>
  queryOptions({
    queryKey: platformOrganizationKeys.detail(organizationId),
    queryFn: () => getPlatformOrganizationDetail(organizationId, headers),
  });
