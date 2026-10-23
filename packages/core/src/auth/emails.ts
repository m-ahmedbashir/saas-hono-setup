import { invitationEmail, resetPasswordEmail, sendEmail, verifyEmailEmail } from "../email";
import { resolvePortalUrl } from "./urls";

// Every link in an auth email is built here, from PORTAL_URL — never from Better Auth's
// own `url`, whose callbackURL comes from the client, and never from request headers.
const portalUrl = resolvePortalUrl(process.env);

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

/**
 * Better Auth's `emailVerification.sendVerificationEmail`. Unlike reset, the link has to
 * hit Better Auth's own `GET /verify-email` — that's what marks the account verified and,
 * with autoSignInAfterVerification, signs the user in. So this keeps Better Auth's `url`
 * (its origin is `baseURL`, from BETTER_AUTH_URL) but replaces the `callbackURL` it
 * carries: that one comes from the sign-up/resend request body. It lands on the portal's
 * /auth/email-verified, which also explains a failed link (Better Auth appends
 * `?error=<code>`) to someone who isn't signed in. Fire-and-forget for the same reason as
 * reset: sign-up and resend await this hook (1.7.12 `sign-up.mjs` via
 * runInBackgroundOrAwait, `email-verification.mjs`'s sendVerificationEmailFn directly).
 */
export async function sendVerificationEmailMessage({
  user,
  url,
}: {
  user: { email: string };
  url: string;
}): Promise<void> {
  const link = new URL(url);
  link.searchParams.set("callbackURL", `${portalUrl}/auth/email-verified`);
  void sendEmail({ to: user.email, ...verifyEmailEmail({ url: link.toString() }) });
}
