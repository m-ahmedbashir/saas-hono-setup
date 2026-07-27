import { queryOptions } from "@tanstack/react-query";
import { getUsers } from "./service";
import type { PlatformUser, UserFilters } from "./types";

export type { PlatformUser };

export const userKeys = {
  all: ["platform-users"] as const,
  list: (filters: UserFilters) => [...userKeys.all, "list", filters] as const,
};

export const usersQueryOptions = (filters: UserFilters, headers?: HeadersInit) =>
  queryOptions({
    queryKey: userKeys.list(filters),
    queryFn: () => getUsers(filters, headers),
  });
