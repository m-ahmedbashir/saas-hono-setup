import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@repo/shared/query-client";
import { banIndividual, unbanIndividual } from "./service";
import { platformIndividualKeys } from "./queries";

const invalidatePlatformIndividuals = () => {
  getQueryClient().invalidateQueries({ queryKey: platformIndividualKeys.all });
};

export const banIndividualMutation = mutationOptions({
  mutationFn: ({ userId, banReason }: { userId: string; banReason?: string }) =>
    banIndividual(userId, banReason),
  onSettled: (_data, error) => {
    if (!error) invalidatePlatformIndividuals();
  },
});

export const unbanIndividualMutation = mutationOptions({
  mutationFn: (userId: string) => unbanIndividual(userId),
  onSettled: (_data, error) => {
    if (!error) invalidatePlatformIndividuals();
  },
});
