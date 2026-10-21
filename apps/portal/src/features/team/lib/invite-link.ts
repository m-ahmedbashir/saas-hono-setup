// There's no invitation email yet (no email provider — specs/customer-portal-plan.md), so
// an invite is a link the owner shares themselves. The invitation id is unguessable and
// only works for the invited email address (Better Auth checks it on accept).
export function inviteLink(invitationId: string): string {
  return `${window.location.origin}/auth/accept-invite?id=${encodeURIComponent(invitationId)}`;
}
