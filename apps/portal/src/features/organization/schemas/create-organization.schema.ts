import { z } from "zod";

// UX-only validation — Better Auth on apps/api is the authority on what it accepts.
export const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(100, "Name is too long"),
});

export type CreateOrganizationValues = z.infer<typeof createOrganizationSchema>;
