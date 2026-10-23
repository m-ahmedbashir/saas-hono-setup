/**
 * The low-level "send this email" contract — a transport, not a notification. Auth emails
 * (reset, verification, invitation) call it directly, never through the notifications
 * module: they carry one-time tokens that must not be persisted to the in-app inbox, and
 * go to people who may have no account yet. A future email notification channel would
 * call this same sender. Same interface-in-core / implementation-in-apps split as
 * BillingGateway: apps/api registers the vendor adapter (see ./registry.ts).
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}
