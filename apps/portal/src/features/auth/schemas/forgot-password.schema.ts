import { z } from "zod";

// UX-only, same reasoning as sign-in.schema.ts — Better Auth on apps/api is the authority.
export const forgotPasswordSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});

export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
