import { apiFetch } from "@/lib/api-client";
import type {
  PlatformOrganizationFilters,
  PlatformOrganizationsResponse,
  CreatePlatformOrganizationPayload,
  CreatePlatformOrganizationResult,
} from "./types";

interface SuspensionResult {
  organizationId: string;
  suspended: boolean;
}

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

export async function banOrganization(
  organizationId: string,
  reason?: string,
): Promise<SuspensionResult> {
  return apiFetch<SuspensionResult>(`/platform-organizations/${organizationId}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function unbanOrganization(organizationId: string): Promise<SuspensionResult> {
  return apiFetch<SuspensionResult>(`/platform-organizations/${organizationId}/unban`, {
    method: "POST",
  });
}
