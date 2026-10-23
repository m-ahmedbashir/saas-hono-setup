// Team management goes straight to Better Auth's organization plugin (authClient.organization.*)
// — those routes already are the real backend, permission-checked and seat-limited server
// side (packages/core's auth config), same reasoning as apps/admin's users feature. Reads
// come from Better Auth's own reactive useActiveOrganization() (it refetches after every
// /organization/* call), so only writes live here.
import { roles } from "@repo/core/auth/permissions";
import { authClient } from "@/lib/auth-client";
import { describeAuthError, unwrapAuthResult as unwrap } from "@/lib/auth-action";

// Derived from the shared roles map so a new role is invitable without a second edit here;
// "owner" is excluded because ownership only changes through transfer-ownership.
export type InvitableRole = Exclude<keyof typeof roles, "owner">;

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

/**
 * Whether a member with this role may invite/remove people and change roles — checked
 * against the same `roles` map the server enforces with (`Role.authorize()`, exactly what
 * apps/api's requirePermission runs), never by comparing role names. Takes the caller's
 * role from the live member list rather than calling /organization/has-permission: that's
 * no network round trip (and no extra full-organization refetch, which every
 * /organization/* call triggers in Better Auth's client), and it can't go stale — the
 * member list refreshes itself after any role change. UX gating only; the server checks
 * every action regardless. A member can hold several comma-separated roles; any one that
 * grants it is enough, same as on the server.
 */
export function canManageTeam(role: string | undefined): boolean {
  if (!role) return false;
  return role.split(",").some(
    (name) =>
      roles[name.trim() as keyof typeof roles]?.authorize({
        invitation: ["create", "cancel"],
        member: ["update", "delete"],
      }).success === true,
  );
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
  return describeAuthError(error, friendlyMessages);
}
