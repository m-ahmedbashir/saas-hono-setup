import type { OutgoingEmail } from "./types";

type RenderedEmail = Omit<OutgoingEmail, "to">;

// Organization and inviter names are user-controlled and land in someone else's inbox, so
// everything interpolated into html is escaped — an org named `<a href=…>` must not become
// a link in the invitee's email.
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function layout(paragraphs: string[], action: { label: string; url: string }): string {
  const body = paragraphs.map((p) => `<p>${p}</p>`).join("\n");
  const url = escapeHtml(action.url);
  return `<!doctype html>
<html><body style="font-family: sans-serif; line-height: 1.5; color: #111">
${body}
<p><a href="${url}" style="display: inline-block; padding: 10px 16px; background: #111; color: #fff; text-decoration: none; border-radius: 6px">${escapeHtml(action.label)}</a></p>
<p style="color: #555; font-size: 13px">Or paste this link into your browser:<br>${url}</p>
</body></html>`;
}

export function resetPasswordEmail({ url }: { url: string }): RenderedEmail {
  const intro = "Someone asked to reset the password for your account.";
  const ignore = "If it wasn't you, ignore this email — your password stays the same.";
  return {
    subject: "Reset your password",
    html: layout([intro, "This link works once and expires in 1 hour.", ignore], {
      label: "Reset password",
      url,
    }),
    text: `${intro}\n\nReset it here (works once, expires in 1 hour):\n${url}\n\n${ignore}\n`,
  };
}

export function verifyEmailEmail({ url }: { url: string }): RenderedEmail {
  const intro = "Confirm this is your email address to finish setting up your account.";
  const ignore = "If you didn't create an account, ignore this email.";
  return {
    subject: "Verify your email address",
    html: layout([intro, ignore], { label: "Verify email", url }),
    text: `${intro}\n\nVerify it here:\n${url}\n\n${ignore}\n`,
  };
}

export function invitationEmail({
  url,
  organizationName,
  inviterName,
  role,
}: {
  url: string;
  organizationName: string;
  inviterName: string;
  role: string;
}): RenderedEmail {
  const ignore = "If you weren't expecting this, you can ignore this email.";
  return {
    subject: `You're invited to join ${organizationName}`,
    html: layout(
      [
        `${escapeHtml(inviterName)} invited you to join <strong>${escapeHtml(organizationName)}</strong> as ${escapeHtml(role)}.`,
        "Sign in or create an account with this email address to accept.",
        ignore,
      ],
      { label: "Accept invitation", url },
    ),
    text: `${inviterName} invited you to join ${organizationName} as ${role}.\n\nSign in or create an account with this email address to accept:\n${url}\n\n${ignore}\n`,
  };
}
