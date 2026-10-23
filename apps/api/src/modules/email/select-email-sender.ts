import type { EmailSender } from "@repo/core";
import { ConsoleEmailSender } from "./console-email.sender";
import { ResendEmailSender } from "./resend-email.sender";

/**
 * Resend when `RESEND_API_KEY` is set; otherwise the console sender, except in production,
 * where it would write one-time links into the logs — there, no sender (sendEmail warns
 * and drops each email, and every account action still works).
 */
export function selectEmailSender(env: NodeJS.ProcessEnv): EmailSender | null {
  if (env.RESEND_API_KEY) {
    if (!env.EMAIL_FROM) {
      throw new Error("RESEND_API_KEY is set but EMAIL_FROM isn't — set the sender address.");
    }
    return new ResendEmailSender(env.RESEND_API_KEY, env.EMAIL_FROM);
  }
  if (env.NODE_ENV === "production") {
    console.warn("[email] RESEND_API_KEY isn't set — no emails will be sent.");
    return null;
  }
  return new ConsoleEmailSender();
}
