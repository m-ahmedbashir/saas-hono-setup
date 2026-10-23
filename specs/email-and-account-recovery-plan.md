# Email & Account Recovery — Implementation Plan

Read [specs/README.md](./README.md) first — it holds the rules every workstream follows.

## Objective

Today the app can't send email at all, which leaves three common SaaS basics missing:

- **Forgot / reset password.** The portal's sign-in page already links to
  `/auth/forgot-password` — **that page doesn't exist**, so it's a dead link today.
- **Email verification** of new accounts.
- **Invitation emails.** Invitations work, but only as links the owner copies by hand
  (`apps/portal/src/features/team/`).

Build one vendor-agnostic way to send email, wire it into Better Auth's three email hooks, and
add the portal pages those emails link to.

**Users:** anyone signing up or signing in to `apps/portal` (individuals and org members), and
org owners/admins inviting people. Staff (`apps/admin`) are out of scope — see Open questions.

## Verified facts this plan relies on

Checked against `better-auth@1.6.23` when written. **The repo is now on 1.7.12 — re-confirm
each fact below in the installed 1.7.12 source before relying on it** (specs/README.md rule 3);
if anything moved, the source wins and this spec gets updated.

- **Rate limiting already exists** (`packages/core/src/auth/rate-limit.ts`, production only,
  database storage, client IP from `cf-connecting-ip`). `/request-password-reset` is already
  limited to 5/min. **Add `/send-verification-email`** to `customRules` (suggest 3/min), or the
  "resend" button becomes a way to spam someone's inbox. Keep the rule list in that one file.

- Hook options exist (`@better-auth/core/dist/.../init-options.d.mts`):
  - `emailAndPassword.sendResetPassword({ user, url, token }, request)`,
    `emailAndPassword.resetPasswordTokenExpiresIn`,
    `emailAndPassword.requireEmailVerification` (blocks sign-in until verified).
  - `emailVerification.sendVerificationEmail({ user, url, token }, request)`,
    `emailVerification.sendOnSignUp`, `emailVerification.autoSignInAfterVerification`.
  - Organization plugin `sendInvitationEmail({ id, role, email, organization, invitation,
inviter })` (`better-auth/dist/plugins/organization/types.d.mts`). Today it's unset, so Better
    Auth skips sending and only stores the invitation (`crud-invites.mjs`).
- Endpoints exist: `/request-password-reset`, `/reset-password`, `/send-verification-email`,
  `/verify-email` — all proxied through the existing `apps/api` `/api/auth/**` catch-all, so no
  new `apps/api` routes are needed for them.
- `packages/core/src/auth/index.ts` currently sets none of these options.
- Better Auth's `advanced.backgroundTasks` exists for serverless runtimes only (Vercel
  `waitUntil`, Cloudflare `ctx.waitUntil`). This API is a long-lived Node server, so it isn't
  needed — see "Don't wait on the send" below.

## Architecture

Same **interface in core / implementation in apps** split as `BillingGateway` and the seat-limit
resolver (`packages/core/src/auth/membership-limit.ts`):

```
packages/core/src/email/types.ts        EmailSender interface — contract only, no vendor
packages/core/src/email/templates.ts    pure functions: (data) => { subject, html, text }
packages/core/src/email/registry.ts     registerEmailSender() / sendEmail() — fail-safe if unset
packages/core/src/auth/index.ts         the three Better Auth hooks call sendEmail(...)
apps/api/src/modules/email/<vendor>-email.sender.ts   the only file importing the vendor SDK
apps/api/src/modules/email/console-email.sender.ts    dev/CI: logs the email (incl. its link)
apps/api/src/lib/auth-wiring.ts         registers the sender (already registers seat usage)
apps/portal/src/app/auth/forgot-password/page.tsx
apps/portal/src/app/auth/reset-password/page.tsx       reads ?token=
apps/portal/src/features/auth/components/{forgot-password-view,reset-password-view}.tsx
```

- **Email is a transport, not a notification — two layers, one sender.** `EmailSender` (this
  spec) is the low-level "send this email" contract. The notifications module
  (`packages/core/src/notifications/types.ts`) already has a `NotificationChannel` interface
  meant for an email channel later; when email _notifications_ are wanted, that's one new
  `email-channel.ts` in `apps/api/src/modules/notifications/channels/` (next to
  `websocket-channel.ts`) that calls the same `EmailSender`. **Don't build it in this spec.**
  The auth emails here call `EmailSender` directly and must **never** go through
  notifications, because:
  - they carry one-time tokens, and notifications are persisted to the `notification` table
    and shown in the in-app inbox — a reset link would be stored in the database and visible
    to anyone with the session;
  - they go to people who may have no account (invitees) or whose email isn't verified yet —
    notifications are addressed to a `userId`;
  - they must always send, regardless of any future notification preferences or unsubscribe.
- **Why a registry, not a direct import:** Better Auth's hooks must live in `packages/core`'s
  `betterAuth()` config, and `packages/core` must never import `apps/api` (AGENTS.md). Reuse
  the exact pattern `membership-limit.ts` established; don't invent a second one.
- **Unregistered sender:** unlike seat limits (which fail closed), a missing email sender must
  not break sign-up. `sendEmail` with no sender registered logs a clear warning and returns.
  In dev and CI, `auth-wiring.ts` registers the console sender when no provider key is set —
  same "optional, no-op if unset" stance as Sentry (`apps/api/src/instrument.ts`).
- **Templates are plain functions returning `{ subject, html, text }`** — always include a
  `text` part. No templating library unless the human approves one (see Boundaries).
- **Links point at the portal.** Better Auth builds `url` from its `baseURL` (the API). Pass
  `redirectTo` / `callbackURL` from the portal so the user lands on a portal page, and keep the
  portal origin in `ALLOWED_ORIGINS` (it already is) — Better Auth rejects redirects to origins
  outside `trustedOrigins`. Invitation links are built as
  `${PORTAL_URL}/auth/accept-invite?id=<id>` — the same path `features/team/lib/invite-link.ts`
  builds.
- **Don't wait on the send.** In `sendResetPassword`, start the send and return without
  `await`ing it (catch and log the rejection). Awaiting it makes the response measurably slower
  when the email exists, which lets an attacker probe which addresses have accounts. The
  `/request-password-reset` response must look identical for known and unknown addresses.

## Product decisions in this plan

- **Verification email on sign-up:** `sendOnSignUp: true`, `autoSignInAfterVerification: true`.
- **`requireEmailVerification`: off in this plan.** Turning it on would lock out every existing
  unverified account at once. It needs its own rollout decision — see Open questions.
- The portal shows a dismissible "Verify your email" notice (with "resend") to signed-in,
  unverified users, using `session.user.emailVerified`.
- **Invitation email** is sent in addition to the existing copy-link flow, not instead of it —
  owners can still share the link themselves.

## Tech stack & commands

Existing stack only; the email provider SDK is the one new dependency (see Open questions).

```
pnpm --filter @repo/core test
pnpm --filter @repo/api test
pnpm --filter @repo/portal test
pnpm --filter @repo/portal dev          # :3002 — needs apps/api running (:8787)
pnpm --filter @repo/api dev
```

New env vars (add to `.env.example`, README's env table and, if tests need them, ci.yml):
`EMAIL_FROM`, `PORTAL_URL`, and the provider's API key (e.g. `RESEND_API_KEY`). Unset key →
console sender, so CI needs only `EMAIL_FROM`/`PORTAL_URL` placeholders.

## Code style

Follow the seat-usage contract in `packages/core/src/auth/membership-limit.ts` exactly:

```ts
// packages/core/src/email/types.ts
export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface EmailSender {
  send(email: OutgoingEmail): Promise<void>;
}
```

Portal pages follow `apps/portal/src/features/auth/components/sign-in-view.tsx`: `useAppForm` +
Zod schema in `features/auth/schemas/`, `authClient` calls, errors shown in an `Alert`.

## Testing strategy

- **`packages/core` unit tests:** each template returns subject + html + text and includes the
  link it's given; `sendEmail` with no sender registered doesn't throw.
- **`apps/api` integration tests** (new `email.integration.test.ts`), registering a capturing
  test sender instead of the console one:
  - Requesting a reset for a real account sends exactly one email to that address whose link
    contains a token; completing `/reset-password` with that token changes the password (old
    one rejected, new one works).
  - Requesting a reset for an unknown address sends nothing **and returns the same status and
    body** as for a known address.
  - Sign-up sends a verification email; following its link marks `emailVerified`.
  - Inviting someone sends one email to the invitee whose link is the portal accept-invite URL
    for that invitation id.
  - A sender that throws doesn't make sign-up or invite fail.
- **Portal component tests:** forgot-password (validation, success message shown whether or not
  the email exists), reset-password (missing/invalid token state, password rules, success →
  sign-in), the verify-email notice (hidden when verified, resend calls the client).

## Tasks

`[x]` done and merged to `develop` · `[~]` in progress · `[ ]` not started.

- [x] **1. Email contract + registry + templates** in `packages/core/src/email/`, with unit tests.
      Export through a side-effect-free subpath only if client code needs it (it shouldn't).
- [x] **2. Console sender + provider sender** in `apps/api/src/modules/email/`, registered in
      `lib/auth-wiring.ts` (provider when its key is set, console otherwise). Provider file is the
      only one importing the SDK.
- [x] **3. Password reset hook** + integration tests (incl. the unknown-address case and the
      not-awaited send).
- [x] **4. Portal forgot-password and reset-password pages** + component tests. Fixes the dead
      sign-in link.
- [~] _(in progress)_ **5. Verification email on sign-up** + verify notice in the portal + tests.
- [~] _(in progress)_ **6. Invitation email hook** + integration test; update the team page copy ("we've emailed
  them; you can also share this link").
- [ ] **7. Docs:** README env vars and setup, AGENTS.md section (email contract, "don't await the
      reset send", unregistered-sender behaviour), CHANGELOG entry text in the PR.

## Boundaries

- **Always:** keep `/request-password-reset` indistinguishable for known vs unknown emails;
  include a plain-text part; build every link from config (`PORTAL_URL`), never from request
  headers; log send failures without logging tokens or full links in production.
- **Ask first:** the provider choice and adding its SDK; turning on `requireEmailVerification`;
  adding a templating library (e.g. React Email); any `betterAuth()` option beyond the ones
  listed here.
- **Never:** import the provider SDK outside its sender file; put a reset or verification token
  in a log line; send email from `apps/portal`/`apps/admin` directly; block sign-up on email
  delivery.

## Success criteria

- A user who forgot their password can request a reset from the portal, receive the email,
  set a new password, and sign in with it — and the old password no longer works.
- `/auth/forgot-password` exists; the sign-in page has no dead links.
- New sign-ups receive a verification email; following it marks the account verified.
- An invited person receives an email whose link opens the portal's accept-invite page for
  their invitation.
- With no provider key configured, everything still works and the emails appear in the API log.

## Open questions

1. **Which provider?** Resend is the suggested default (simple API, good free tier); Postmark is
   the alternative with strong deliverability. Needs a verified sending domain either way.
2. **When to require verification?** Options: never; only for new accounts from a date; or for
   everyone after a grace period with reminders.
3. **Staff app:** should `apps/admin` get forgot-password too? Staff are admin-created, so it's
   lower priority — the email contract built here makes it a small follow-up.
