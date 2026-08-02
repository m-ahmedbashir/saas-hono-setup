// Real platform staff — Better Auth's own `user` row (see packages/core/src/auth
// index.ts's admin plugin), not the template's fake first_name/last_name/phone/status
// shape. `role` matches packages/core/src/auth/platform-permissions.ts's two tiers
// ("admin" | "support"); anything else (or null/undefined) is treated as no platform
// access at all — see AGENTS.md's Platform admin section.
export interface PlatformStaff {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  role: string | null | undefined;
  banned: boolean | null;
  banReason?: string | null;
  banExpires?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type PlatformRole = "admin" | "support";

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

export type PlatformStaffResponse = {
  staff: PlatformStaff[];
  total: number;
};

export type CreateEmployeePayload = {
  name: string;
  email: string;
  password: string;
  role: PlatformRole;
};
