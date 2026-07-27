import { apiFetch } from "@/lib/api-client";
import type {
  PlatformOrganizationFilters,
  PlatformOrganizationsResponse,
  CreatePlatformOrganizationPayload,
  CreatePlatformOrganizationResult,
} from "./types";

export async function getPlatformOrganizations(
  filters: PlatformOrganizationFilters,
  headers?: HeadersInit,
): Promise<PlatformOrganizationsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  const query = params.toString();

  return apiFetch<PlatformOrganizationsResponse>(
    `/platform-organizations${query ? `?${query}` : ""}`,
    { headers },
  );
}

export async function createPlatformOrganization(
  payload: CreatePlatformOrganizationPayload,
): Promise<CreatePlatformOrganizationResult> {
  return apiFetch<CreatePlatformOrganizationResult>("/platform-organizations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
