import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import { createEmployee, setUserRole, banUser, unbanUser, removeUser } from "./service";
import { userKeys } from "./queries";
import type { CreateEmployeePayload, PlatformRole } from "./types";

// `onSettled` (with an `!error` guard) is used instead of `onSuccess` because these
// options are spread into `useMutation` calls that define their own `onSuccess` callbacks
// for toasts/UI state. `onSuccess` would be silently overwritten; `onSettled` survives
// the spread and still only invalidates when the mutation actually succeeded.
const invalidateUsers = () => {
  getQueryClient().invalidateQueries({ queryKey: userKeys.all });
};

export const createEmployeeMutation = mutationOptions({
  mutationFn: (data: CreateEmployeePayload) => createEmployee(data),
  onSettled: (_data, error) => {
    if (!error) invalidateUsers();
  },
});

export const setUserRoleMutation = mutationOptions({
  mutationFn: ({ userId, role }: { userId: string; role: PlatformRole }) =>
    setUserRole(userId, role),
  onSettled: (_data, error) => {
    if (!error) invalidateUsers();
  },
});

export const banUserMutation = mutationOptions({
  mutationFn: ({ userId, banReason }: { userId: string; banReason?: string }) =>
    banUser(userId, banReason),
  onSettled: (_data, error) => {
    if (!error) invalidateUsers();
  },
});

export const unbanUserMutation = mutationOptions({
  mutationFn: (userId: string) => unbanUser(userId),
  onSettled: (_data, error) => {
    if (!error) invalidateUsers();
  },
});

export const removeUserMutation = mutationOptions({
  mutationFn: (userId: string) => removeUser(userId),
  onSettled: (_data, error) => {
    if (!error) invalidateUsers();
  },
});
