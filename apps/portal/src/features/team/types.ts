import type { authClient } from "@/lib/auth-client";

// Derived from Better Auth's own client types (the full active organization), never
// hand-written — so a Better Auth upgrade that changes the shape fails the typecheck here.
export type ActiveOrganization = NonNullable<
  ReturnType<typeof authClient.useActiveOrganization>["data"]
>;
export type TeamMember = ActiveOrganization["members"][number];
export type TeamInvitation = ActiveOrganization["invitations"][number];
