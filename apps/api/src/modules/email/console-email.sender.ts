import type { EmailSender, OutgoingEmail } from "@repo/core";

/**
 * Dev/CI only: prints the email so its link can be followed without a provider. It prints
 * one-time tokens by design, which is why select-email-sender never picks it in production.
 */
export class ConsoleEmailSender implements EmailSender {
  async send(email: OutgoingEmail): Promise<void> {
    console.log(
      `\n[email] ── to: ${email.to}\n[email] ── subject: ${email.subject}\n${email.text}\n[email] ──\n`,
    );
  }
}
