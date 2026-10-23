// The invitee is emailed this link (packages/core/src/auth/emails.ts builds the same path
// from PORTAL_URL — keep the two in sync), and the owner can share it themselves too. The
// invitation id is unguessable and only works for the invited email address (Better Auth
// checks it on accept).

/** The one place the portal builds this URL, so every caller encodes the id the same way. */
export function acceptInvitePath(invitationId: string): string {
  return `/auth/accept-invite?id=${encodeURIComponent(invitationId)}`;
}

export function inviteLink(invitationId: string): string {
  return `${window.location.origin}${acceptInvitePath(invitationId)}`;
}
