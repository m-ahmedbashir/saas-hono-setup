import * as z from "zod";

// UX-only validation for the create-employee form, same reasoning as
// features/auth/schemas/sign-in.schema.ts — Better Auth on apps/api remains the real
// authority on password rules; this just fails fast before a network round-trip.
export const createEmployeeSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["admin", "support"], { message: "Please select a role" }),
});

export type CreateEmployeeFormValues = z.infer<typeof createEmployeeSchema>;
