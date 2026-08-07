import { z } from "zod";

// UX-only validation, same reasoning as sign-in.schema.ts — the real authority is
// Better Auth on apps/api. Doesn't duplicate its exact password-length rule; catches the
// obvious "too short to possibly work" case before a network round-trip.
export const signUpSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignUpValues = z.infer<typeof signUpSchema>;
