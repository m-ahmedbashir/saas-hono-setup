import { queryOptions } from "@tanstack/react-query";
import { getOrganizationProfile } from "./service";

// Keyed by organizationId although the request doesn't carry it (apps/api reads it from
// the session) — so one org's cached profile can never be shown after switching to another.
export const organizationKeys = {
  all: ["organization"] as const,
  profile: (organizationId: string) =>
    [...organizationKeys.all, "profile", organizationId] as const,
};

export const organizationProfileQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: organizationKeys.profile(organizationId),
    queryFn: getOrganizationProfile,
  });
