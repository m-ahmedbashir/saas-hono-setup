import { apiFetch } from "@repo/shared/api-client";
import { authClient } from "@/lib/auth-client";
import type {
  PlatformIndividualFilters,
  PlatformIndividualsResponse,
  PlatformIndividualDetail,
} from "./types";

export async function getPlatformIndividuals(
  filters: PlatformIndividualFilters,
  headers?: HeadersInit,
): Promise<PlatformIndividualsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  if (filters.search) params.set("search", filters.search);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.subscriptionStatus) params.set("subscriptionStatus", filters.subscriptionStatus);
  if (filters.hasOrganization !== undefined) {
    params.set("hasOrganization", String(filters.hasOrganization));
  }
  const query = params.toString();

  return apiFetch<PlatformIndividualsResponse>(`/platform-individuals${query ? `?${query}` : ""}`, {
    headers,
  });
}

export async function getPlatformIndividualDetail(
  userId: string,
  headers?: HeadersInit,
): Promise<PlatformIndividualDetail> {
  return apiFetch<PlatformIndividualDetail>(`/platform-individuals/${userId}`, { headers });
}

// Real Better Auth ban/unban — authClient.admin.* directly, no apps/api route. Better
// Auth's admin plugin already works on any user id regardless of role (immediately
// revokes sessions, verified in AGENTS.md's Platform admin section), so there's
// nothing custom to build here — same call the existing Users (staff) table's row
// action already makes. Unlike platform-organizations' ban, this is real enforcement
// from day one, not a flag.
function unwrap<T>(result: { data: T | null; error: { message?: string } | null }): T {
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
  unwrap(result);
}

export async function unbanIndividual(userId: string): Promise<void> {
  const result = await authClient.admin.unbanUser({ userId });
  unwrap(result);
}
