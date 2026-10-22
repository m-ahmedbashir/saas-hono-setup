"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

/**
 * Switches the session's active organization — or back to the personal account with
 * `null` — then invalidates every cached query (specs/customer-portal-plan.md's
 * "Org-switch cache invalidation"): an org switch changes which billing/team data is
 * correct to show across several features at once, so a broad invalidation is simpler
 * and safer than tracking each affected key. Better Auth's own hooks (active org, member
 * list) refresh themselves via its signals; this covers React Query (e.g. billing).
 * Better Auth checks membership server-side before switching.
 */
export function useSwitchOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string | null) => {
      const { error } = await authClient.organization.setActive({ organizationId });
      if (error) throw new Error(error.message ?? "Could not switch organization");
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
