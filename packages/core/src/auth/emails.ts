import { resetPasswordEmail, sendEmail } from "../email";

// Every link in an auth email is built here, from PORTAL_URL — never from Better Auth's
// own `url`, whose callbackURL comes from the client, and never from request headers.
// Resolved once at startup: a per-request failure inside a hook would make known and
// unknown addresses answer differently, so a production misconfiguration fails at boot.
const portalUrl = resolvePortalUrl();

function resolvePortalUrl(): string {
  const configured = process.env.PORTAL_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PORTAL_URL must be set in production — auth emails link to the portal.");
  }
  return "http://localhost:3002";
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
