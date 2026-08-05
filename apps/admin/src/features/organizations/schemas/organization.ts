import * as z from "zod";

// UX-only validation, same reasoning as features/staff/schemas/staff.ts — apps/api's
// createPlatformOrganizationSchema remains the real authority; this just fails fast.
export const createPlatformOrganizationSchema = z.object({
  organizationName: z.string().min(1, "Organization name is required"),
  organizationSlug: z
    .string()
    .min(2, "Slug must be at least 2 characters")
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
  ownerName: z.string().min(2, "Name must be at least 2 characters"),
  ownerEmail: z.string().email("Please enter a valid email"),
  ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
});

export type CreatePlatformOrganizationFormValues = z.infer<typeof createPlatformOrganizationSchema>;

export const banOrganizationSchema = z.object({
  reason: z.string().max(500, "Reason must be 500 characters or fewer").optional(),
});

export type BanOrganizationFormValues = z.infer<typeof banOrganizationSchema>;
