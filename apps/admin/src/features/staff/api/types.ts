import type { platformRoles } from "@repo/core/auth/platform-permissions";
import type { UserWithRole } from "better-auth/plugins/admin";

// Platform staff are Better Auth `user` rows read through its admin plugin client — typed with
// the admin plugin's own declared row type (what listUsers/createUser return), never
// hand-written, so a Better Auth upgrade that changes the shape fails the typecheck here.
// Not ReturnType<typeof authClient.admin.listUsers>: that method is generic over its fetch
// options, and ReturnType of it collapses to `any`. Its client parses ISO dates, so the
// Date fields are real Dates (better-auth's client/parser.mjs, parseDates defaults to true).
export type PlatformStaff = UserWithRole;

// The two tiers in packages/core/src/auth/platform-permissions.ts; anything else (or no
// role) means no platform access — see AGENTS.md's Platform admin section.
export type PlatformRole = keyof typeof platformRoles;

// The page's paging/search/sort state, mapped onto listUsers' own query in service.ts.
export type PlatformStaffFilters = {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  // Matches authClient.admin.listUsers's own shape directly (single-column sort) rather
  // than a JSON-stringified TanStack Table sort array — one fewer translation step.
  sortBy?: string;
  sortDirection?: "asc" | "desc";
};

// The create-employee form's values; only `role` is narrower than createUser accepts.
export type CreateEmployeePayload = {
  name: string;
  email: string;
  password: string;
  role: PlatformRole;
};
