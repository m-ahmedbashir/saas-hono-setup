// Team management goes straight to Better Auth's organization plugin (authClient.organization.*)
// — those routes already are the real backend, permission-checked and seat-limited server
// side (packages/core's auth config), same reasoning as apps/admin's users feature. Reads
// come from Better Auth's own reactive useActiveOrganization() (it refetches after every
// /organization/* call), so only writes live here.
import { authClient } from "@/lib/auth-client";

export type InvitableRole = "member" | "admin";

/** A Better Auth error, keeping its machine-readable `code` (e.g. INVITATION_LIMIT_REACHED) so callers can branch on it rather than on message text. */
export class TeamActionError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code: string | undefined) {
    super(message);
    this.name = "TeamActionError";
    this.code = code;
  }
}

// authClient calls resolve { data, error } and never throw for expected failures —
// normalized into a thrown error here so TanStack Query's mutation error state works.
function unwrap<T>(result: {
  data: T | null;
  error: { message?: string; code?: string } | null;
}): T {
  if (result.error) {
    throw new TeamActionError(result.error.message ?? "Request failed", result.error.code);
  }
  if (result.data === null) {
    throw new TeamActionError("Request returned no data", undefined);
  }
  return result.data;
}

export async function inviteMember(input: { email: string; role: InvitableRole }) {
  return unwrap(await authClient.organization.inviteMember(input));
}

export async function cancelInvitation(invitationId: string) {
  return unwrap(await authClient.organization.cancelInvitation({ invitationId }));
}

export async function removeMember(memberId: string) {
  return unwrap(await authClient.organization.removeMember({ memberIdOrEmail: memberId }));
}

export async function updateMemberRole(input: { memberId: string; role: InvitableRole }) {
  return unwrap(await authClient.organization.updateMemberRole(input));
}

// Asks the server (Better Auth's /organization/has-permission, same `roles` map the routes
// enforce with) rather than comparing role names here — UX gating only.
export async function canManageTeam(): Promise<boolean> {
  const result = await authClient.organization.hasPermission({
    permissions: { invitation: ["create", "cancel"], member: ["update", "delete"] },
  });
  return unwrap(result).success;
}

export async function getInvitation(invitationId: string) {
  return unwrap(await authClient.organization.getInvitation({ query: { id: invitationId } }));
}

export async function acceptInvitation(invitationId: string) {
  return unwrap(await authClient.organization.acceptInvitation({ invitationId }));
}

export async function rejectInvitation(invitationId: string) {
  return unwrap(await authClient.organization.rejectInvitation({ invitationId }));
}

const friendlyMessages: Record<string, string> = {
  INVITATION_LIMIT_REACHED:
    "Every seat on your plan is taken or already invited. Free up a seat or upgrade your plan to invite more people.",
  ORGANIZATION_MEMBERSHIP_LIMIT_REACHED:
    "This organization has no free seats left. Ask an owner to free up a seat or upgrade the plan.",
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: "That person is already a member.",
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: "That person already has a pending invitation.",
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION:
    "This invitation was sent to a different email address than the one you're signed in with.",
};

/** User-facing text for a team action failure — Better Auth's own message when there's no clearer one. */
export function describeTeamError(error: Error): string {
  const code = error instanceof TeamActionError ? error.code : undefined;
  return (code && friendlyMessages[code]) || error.message;
}
