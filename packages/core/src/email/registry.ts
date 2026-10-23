import type { EmailSender, OutgoingEmail } from "./types";

// Same registration pattern as ../auth/membership-limit.ts: Better Auth's email hooks live
// in packages/core's betterAuth() config, and core never imports apps/api, so apps/api
// registers the sender at startup (lib/auth-wiring.ts).
let sender: EmailSender | null = null;

export function registerEmailSender(next: EmailSender): void {
  sender = next;
}

/**
 * Never rejects. Unlike seat limits (which fail closed), a missing or failing sender must
 * not break sign-up, invites or a reset request — the account action matters more than
 * the email. Callers can therefore fire and forget. Logs name the subject only: the
 * recipient is personal data and the body carries one-time tokens.
 */
export async function sendEmail(email: OutgoingEmail): Promise<void> {
  if (!sender) {
    console.warn(
      `[email] No email sender registered — dropped "${email.subject}". apps/api registers one at startup (lib/auth-wiring.ts).`,
    );
    return;
  }
  try {
    await sender.send(email);
  } catch (err) {
    console.error(
      `[email] Sending "${email.subject}" failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
