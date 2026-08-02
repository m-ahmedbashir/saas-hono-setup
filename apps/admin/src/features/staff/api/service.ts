// Real platform-admin data access — Better Auth's own `admin` plugin client
// (authClient.admin.*, from src/lib/auth-client.ts), not the template's mock
// first_name/last_name/phone in-memory store. This is the one file that would change if
// the data source ever did (matching the service-layer convention this template
// establishes), but there's no apps/api route to swap to here — Better Auth's admin
// endpoints already are the real backend, called directly, per AGENTS.md's Platform
// admin section ("a future admin UI calls them directly, same as any other Better Auth
// endpoint").
import { authClient } from "@/lib/auth-client";
import type {
  CreateEmployeePayload,
  PlatformRole,
  PlatformStaff,
  PlatformStaffFilters,
  PlatformStaffResponse,
} from "./types";

// authClient methods resolve { data, error } — never throw for expected failures, same
// contract as every other Better Auth client call (see AGENTS.md). Normalized into a
// thrown Error here so TanStack Query's error handling works the ordinary way.
function unwrap<T>(result: { data: T | null; error: { message?: string } | null }): T {
  if (result.error) {
    throw new Error(result.error.message ?? "Request failed");
  }
  if (result.data === null) {
    throw new Error("Request returned no data");
  }
  return result.data;
}

export async function getStaff(
  filters: PlatformStaffFilters,
  headers?: HeadersInit,
): Promise<PlatformStaffResponse> {
  const limit = filters.limit ?? 10;
  const offset = ((filters.page ?? 1) - 1) * limit;

  const result = await authClient.admin.listUsers(
    {
      query: {
        limit,
        offset,
        ...(filters.search && {
          searchField: "name" as const,
          searchOperator: "contains" as const,
          searchValue: filters.search,
        }),
        // Always scoped to platform staff (admin/support) — never the bare "user" role
        // Better Auth assigns every regular signup/org-member by default. Without this,
        // authClient.admin.listUsers returns literally every account in the system
        // (Better Auth has no concept of "platform" vs "regular" user, only this app's
        // role split does), which is exactly wrong for a page titled "Platform Staff."
        // A facet pick of one specific role (filters.role) narrows further via `eq`;
        // otherwise `in` scopes to the whole platform-staff set. `in`/`filterValue` as
        // an array is a real, fully-implemented adapter operator (`inArray` under the
        // hood) — verified against the installed drizzle-adapter source, not assumed.
        ...(filters.role
          ? { filterField: "role", filterOperator: "eq" as const, filterValue: filters.role }
          : {
              filterField: "role",
              filterOperator: "in" as const,
              filterValue: ["admin", "support"],
            }),
        ...(filters.sortBy && {
          sortBy: filters.sortBy,
          sortDirection: filters.sortDirection ?? "asc",
        }),
      },
    },
    { headers, credentials: "include" },
  );

  const data = unwrap(result);
  return { staff: data.users as unknown as PlatformStaff[], total: data.total };
}

export async function createEmployee(payload: CreateEmployeePayload): Promise<PlatformStaff> {
  const result = await authClient.admin.createUser({
    name: payload.name,
    email: payload.email,
    password: payload.password,
    role: payload.role,
  });
  return unwrap(result).user as unknown as PlatformStaff;
}

export async function setStaffRole(userId: string, role: PlatformRole): Promise<void> {
  const result = await authClient.admin.setRole({ userId, role });
  unwrap(result);
}

export async function banStaffMember(userId: string, banReason?: string): Promise<void> {
  const result = await authClient.admin.banUser({ userId, banReason });
  unwrap(result);
}

export async function unbanStaffMember(userId: string): Promise<void> {
  const result = await authClient.admin.unbanUser({ userId });
  unwrap(result);
}

export async function removeStaffMember(userId: string): Promise<void> {
  const result = await authClient.admin.removeUser({ userId });
  unwrap(result);
}
