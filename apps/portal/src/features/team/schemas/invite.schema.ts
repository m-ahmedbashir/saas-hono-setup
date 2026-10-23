import { z } from "zod";

// UX-only — Better Auth's invite-member route validates the email and role itself, and its
// permission and seat checks are the authority. "owner" is deliberately not invitable: an
// org has the one owner who created it.
export const inviteSchema = z.object({
  email: z.email("Enter a valid email address"),
  role: z.enum(["member", "admin"]),
});

export type InviteValues = z.infer<typeof inviteSchema>;

export const roleOptions = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
];
