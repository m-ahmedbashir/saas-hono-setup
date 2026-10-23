import { Resend } from "resend";
import type { EmailSender, OutgoingEmail } from "@repo/core";

// The only file that may import `resend` (AGENTS.md) — swapping providers is this one file.
export class ResendEmailSender implements EmailSender {
  private readonly resend: Resend;

  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.resend = new Resend(apiKey);
  }

  async send(email: OutgoingEmail): Promise<void> {
    // Resend returns API failures (bad key, quota, unverified domain) as `error` rather
    // than throwing — verified in resend@6.34.1's types — so surface them as rejections.
    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    if (error) throw new Error(`Resend ${error.name}: ${error.message}`);
  }
}
