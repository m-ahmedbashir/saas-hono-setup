import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { createPlatformOrganization } from "./service";
import { platformOrganizationKeys } from "./queries";
import type { CreatePlatformOrganizationPayload } from "./types";

export const createPlatformOrganizationMutation = mutationOptions({
  mutationFn: (data: CreatePlatformOrganizationPayload) => createPlatformOrganization(data),
  onSettled: (_data, error) => {
    if (!error) getQueryClient().invalidateQueries({ queryKey: platformOrganizationKeys.all });
  },
});
