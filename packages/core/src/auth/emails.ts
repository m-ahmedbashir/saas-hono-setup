import { invitationEmail, resetPasswordEmail, sendEmail } from "../email";

// Every link in an auth email is built here, from PORTAL_URL — never from Better Auth's
// own `url`, whose callbackURL comes from the client, and never from request headers.
// Resolved once at startup: a per-request failure inside a hook would make known and
// unknown addresses answer differently, so a production misconfiguration fails at boot.
const portalUrl = resolvePortalUrl(process.env);

export function resolvePortalUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.PORTAL_URL?.replace(/\/+$/, "");
  const production = env.NODE_ENV === "production";
  if (!configured) {
    if (production) {
      throw new Error("PORTAL_URL must be set in production — auth emails link to the portal.");
    }
    return "http://localhost:3002";
  }
  // The links carry one-time tokens; over plain http anyone on the path could read them.
  if (production && !configured.startsWith("https://")) {
    throw new Error("PORTAL_URL must use https:// in production.");
  }
  return configured;
}

function portalLink(path: string, params: Record<string, string>): string {
  return `${portalUrl}${path}?${new URLSearchParams(params)}`;
}

/**
 * Better Auth's `sendResetPassword`. Starts the send without awaiting it: Better Auth
 * awaits this hook (1.7.12 `password.mjs`, `runInBackgroundOrAwait` with no
 * backgroundTasks), so awaiting delivery here would make a known address answer
 * measurably slower than an unknown one. sendEmail never rejects, so nothing is unhandled.
 */
export async function sendResetPasswordEmail({
  user,
  token,
}: {
  user: { email: string };
  token: string;
}): Promise<void> {
  void sendEmail({
    to: user.email,
    ...resetPasswordEmail({ url: portalLink("/auth/reset-password", { token }) }),
  });
}

/**
 * The organization plugin's `sendInvitationEmail`, sent alongside the copy-link flow, not
 * instead of it. Fire-and-forget like the reset email: Better Auth awaits this hook on
 * both the new-invite and resend paths (1.7.12 `crud-invites.mjs`), and the invite
 * shouldn't wait on, or fail with, delivery. The link is the same path apps/portal's
 * `acceptInvitePath` (features/team/lib/invite-link.ts) builds — keep them in sync.
 */
export async function sendInvitationEmail({
  id,
  role,
  email,
  organization,
  inviter,
}: {
  id: string;
  role: string;
  email: string;
  organization: { name: string };
  inviter: { user: { name: string; email: string } };
}): Promise<void> {
  void sendEmail({
    to: email,
    ...invitationEmail({
      url: portalLink("/auth/accept-invite", { id }),
      organizationName: organization.name,
      inviterName: inviter.user.name || inviter.user.email,
      role,
    }),
  });
}
