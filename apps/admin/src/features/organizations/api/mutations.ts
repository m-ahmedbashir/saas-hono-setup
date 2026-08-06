import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@repo/shared/query-client";
import { createPlatformOrganization, banOrganization, unbanOrganization } from "./service";
import { platformOrganizationKeys } from "./queries";
import type { CreatePlatformOrganizationPayload, BanOrganizationPayload } from "./types";

const invalidatePlatformOrganizations = () => {
  getQueryClient().invalidateQueries({ queryKey: platformOrganizationKeys.all });
};

export const createPlatformOrganizationMutation = mutationOptions({
  mutationFn: (data: CreatePlatformOrganizationPayload) => createPlatformOrganization(data),
  onSettled: (_data, error) => {
    if (!error) invalidatePlatformOrganizations();
  },
});

export const banOrganizationMutation = mutationOptions({
  mutationFn: ({ organizationId, reason }: BanOrganizationPayload) =>
    banOrganization(organizationId, reason),
  onSettled: (_data, error) => {
    if (!error) invalidatePlatformOrganizations();
  },
});

export const unbanOrganizationMutation = mutationOptions({
  mutationFn: (organizationId: string) => unbanOrganization(organizationId),
  onSettled: (_data, error) => {
    if (!error) invalidatePlatformOrganizations();
  },
});
