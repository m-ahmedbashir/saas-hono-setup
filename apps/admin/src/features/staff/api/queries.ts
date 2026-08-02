import { queryOptions } from "@tanstack/react-query";
import { getStaff } from "./service";
import type { PlatformStaff, PlatformStaffFilters } from "./types";

export type { PlatformStaff };

export const staffKeys = {
  all: ["platform-staff"] as const,
  list: (filters: PlatformStaffFilters) => [...staffKeys.all, "list", filters] as const,
};

export const staffQueryOptions = (filters: PlatformStaffFilters, headers?: HeadersInit) =>
  queryOptions({
    queryKey: staffKeys.list(filters),
    queryFn: () => getStaff(filters, headers),
  });
