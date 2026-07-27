import { z } from "zod";

export const listPlatformOrganizationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().min(1).optional(),
});

export type ListPlatformOrganizationsQuery = z.infer<typeof listPlatformOrganizationsQuerySchema>;

// Provisions a brand-new owner account (email/password the admin sets and shares out of
// band) together with the organization — not a lookup of an existing user. Same
// "admin-created, not self-signup" posture as features/users' createEmployeeSchema.
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

export type CreatePlatformOrganizationBody = z.infer<typeof createPlatformOrganizationSchema>;

export const banPlatformOrganizationSchema = z.object({
  reason: z.string().max(500, "Reason must be 500 characters or fewer").optional(),
});

export type BanPlatformOrganizationBody = z.infer<typeof banPlatformOrganizationSchema>;
