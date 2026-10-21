// There's no invitation email yet (no email provider — specs/customer-portal-plan.md), so
// an invite is a link the owner shares themselves. The invitation id is unguessable and
// only works for the invited email address (Better Auth checks it on accept).

/** The one place this URL is built, so every caller encodes the id the same way. */
export function acceptInvitePath(invitationId: string): string {
  return `/auth/accept-invite?id=${encodeURIComponent(invitationId)}`;
}

export function inviteLink(invitationId: string): string {
  return `${window.location.origin}${acceptInvitePath(invitationId)}`;
}
