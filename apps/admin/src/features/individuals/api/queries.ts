import { queryOptions } from "@tanstack/react-query";
import { getPlatformIndividuals, getPlatformIndividualDetail } from "./service";
import type { PlatformIndividual, PlatformIndividualFilters } from "./types";

export type { PlatformIndividual };

export const platformIndividualKeys = {
  all: ["platform-individuals"] as const,
  list: (filters: PlatformIndividualFilters) =>
    [...platformIndividualKeys.all, "list", filters] as const,
  detail: (userId: string) => [...platformIndividualKeys.all, "detail", userId] as const,
};

export const platformIndividualsQueryOptions = (
  filters: PlatformIndividualFilters,
  headers?: HeadersInit,
) =>
  queryOptions({
    queryKey: platformIndividualKeys.list(filters),
    queryFn: () => getPlatformIndividuals(filters, headers),
  });

export const platformIndividualDetailQueryOptions = (userId: string, headers?: HeadersInit) =>
  queryOptions({
    queryKey: platformIndividualKeys.detail(userId),
    queryFn: () => getPlatformIndividualDetail(userId, headers),
  });
