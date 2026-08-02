import { mutationOptions } from "@tanstack/react-query";
import { getQueryClient } from "@/lib/query-client";
import {
  createEmployee,
  setStaffRole,
  banStaffMember,
  unbanStaffMember,
  removeStaffMember,
} from "./service";
import { staffKeys } from "./queries";
import type { CreateEmployeePayload, PlatformRole } from "./types";

// `onSettled` (with an `!error` guard) is used instead of `onSuccess` because these
// options are spread into `useMutation` calls that define their own `onSuccess` callbacks
// for toasts/UI state. `onSuccess` would be silently overwritten; `onSettled` survives
// the spread and still only invalidates when the mutation actually succeeded.
const invalidateStaff = () => {
  getQueryClient().invalidateQueries({ queryKey: staffKeys.all });
};

export const createEmployeeMutation = mutationOptions({
  mutationFn: (data: CreateEmployeePayload) => createEmployee(data),
  onSettled: (_data, error) => {
    if (!error) invalidateStaff();
  },
});

export const setStaffRoleMutation = mutationOptions({
  mutationFn: ({ userId, role }: { userId: string; role: PlatformRole }) =>
    setStaffRole(userId, role),
  onSettled: (_data, error) => {
    if (!error) invalidateStaff();
  },
});

export const banStaffMemberMutation = mutationOptions({
  mutationFn: ({ userId, banReason }: { userId: string; banReason?: string }) =>
    banStaffMember(userId, banReason),
  onSettled: (_data, error) => {
    if (!error) invalidateStaff();
  },
});

export const unbanStaffMemberMutation = mutationOptions({
  mutationFn: (userId: string) => unbanStaffMember(userId),
  onSettled: (_data, error) => {
    if (!error) invalidateStaff();
  },
});

export const removeStaffMemberMutation = mutationOptions({
  mutationFn: (userId: string) => removeStaffMember(userId),
  onSettled: (_data, error) => {
    if (!error) invalidateStaff();
  },
});
