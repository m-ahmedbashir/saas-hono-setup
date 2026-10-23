import { registerSeatUsageResolver } from "@repo/core/auth";
import { registerEmailSender } from "@repo/core";
import { getOrganizationSeatUsage } from "../modules/billing/billing.service";
import { selectEmailSender } from "../modules/email/select-email-sender";

// Gives packages/core's Better Auth config the plan-dependent pieces it can't compute
// itself (core never imports apps/api — see packages/core/src/auth/membership-limit.ts).
// Imported for its side effect by app.ts, so anything that uses the app — the server
// entrypoint and every integration test — has it registered. Code that uses `auth`
// without the app (e.g. a one-off script) gets every invite/join refused, not allowed.
registerSeatUsageResolver(getOrganizationSeatUsage);

// Unlike the seat resolver, a missing email sender fails safe: sendEmail warns and drops.
const emailSender = selectEmailSender(process.env);
if (emailSender) registerEmailSender(emailSender);
