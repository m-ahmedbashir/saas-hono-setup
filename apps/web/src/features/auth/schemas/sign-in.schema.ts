import { z } from "zod";

// UX-only validation — catches obvious mistakes before a network round-trip. The real
// authority is Better Auth on apps/api (min/max password length, real email
// deliverability, etc.); this schema deliberately doesn't duplicate those exact rules.
export const signInSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type SignInValues = z.infer<typeof signInSchema>;
