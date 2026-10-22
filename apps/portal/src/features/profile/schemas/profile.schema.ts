import { z } from "zod";

// UX-only validation, same reasoning as sign-in.schema.ts — the real authority is
// Better Auth on apps/api (authClient.updateUser/changePassword), not duplicated here.
export const updateNameSchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name is too long"),
});

export type UpdateNameValues = z.infer<typeof updateNameSchema>;

// min(8) mirrors Better Auth's own default minPasswordLength (packages/core/src/auth/index.ts
// sets no override) — a UX-only guard to fail fast, not the source of truth.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "New password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
