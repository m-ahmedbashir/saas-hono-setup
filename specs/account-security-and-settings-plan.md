# Account Security & Settings — Implementation Plan

Read [specs/README.md](./README.md) first — it holds the rules every workstream follows.

## Objective

Round out the portal's account page with the settings and protections users expect from any
SaaS, most of which the backend already supports:

1. **Delete my account** — the API exists (`DELETE /account`), there's no button.
2. **Active sessions** — see where you're signed in, sign out one device or all others.
3. **Change email** — with confirmation sent to the new address. **Needs the email spec first.**
4. **Personal details** — phone, date of birth, address (`GET`/`PATCH /profile` exists, no UI).
5. **Production rate limiting that actually works with more than one API instance.**

**Users:** every portal user (individual or org member) — these are personal-account settings,
not organization ones.

## Verified facts this plan relies on

Checked against `better-auth@1.6.23`, `@better-auth/core@1.6.23` and this repo:

- **Use this repo's `DELETE /account`, not Better Auth's `/delete-user`.** Better Auth's endpoint
  exists but is disabled here (no `user.deleteUser` config in `packages/core/src/auth/index.ts`),
  and must stay disabled: ours cancels live Stripe subscriptions first and refuses (422) when the
  user is the only owner of an org that still has other members (AGENTS.md's Account deletion).
- Session endpoints exist and need no config: `/list-sessions`, `/revoke-session`,
  `/revoke-other-sessions` (`better-auth/dist/api/routes/session.mjs`).
- **Change email is off by default:** it needs `user.changeEmail.enabled: true`, and it confirms
  through `sendChangeEmailConfirmation` (or skips confirmation with
  `updateEmailWithoutVerification` — not allowed here, see Boundaries).
- **Rate limiting is on only in production** (`rateLimit.enabled ?? isProduction`,
  `create-context.mjs`) and **stores counters in process memory by default**
  (`storage` default `"memory"`). With two or more API instances each counts separately, so the
  real limit multiplies by the instance count. Options: `storage: "database"` or
  `"secondary-storage"`, plus per-path `customRules`.
- Profile rules already enforced server-side (AGENTS.md's User Profile): `dateOfBirth` not in the
  future or >130 years ago; `addressCountry` ISO 3166-1 alpha-2; on `PATCH`, an omitted field
  means "unchanged", an explicit `null` means "clear it".

## Architecture

```
apps/portal/src/app/(portal)/profile/page.tsx      existing; gains sections below
apps/portal/src/features/profile/components/
  personal-details-form.tsx      GET/PATCH /profile via the `api` client + unwrap()
  active-sessions.tsx            authClient.listSessions / revokeSession / revokeOtherSessions
  change-email-form.tsx          authClient.changeEmail (after the email spec ships)
  delete-account-section.tsx     DELETE /account via the `api` client, typed confirmation
apps/portal/src/features/profile/api/service.ts   the `apps/api` calls (types inferred, no types.ts)
packages/core/src/auth/index.ts  rateLimit: { storage: "database", customRules }; changeEmail
```

- **Delete account:** confirm by typing your email; on success sign out and go to `/auth/sign-in`.
  Map the 422 "only owner with other members" case to a plain message with a link to
  `/organization/settings` (transfer ownership — organization spec) — don't guess the cause from
  text, check the `ApiError`'s `code` (thrown by `unwrap()`).
- **Active sessions:** list device/browser (from user agent), last active, "this device" marker.
  "Sign out other devices" calls `revokeOtherSessions`. Signing out the current session goes
  through the normal sign-out.
- **Personal details:** form fields map 1:1 to the profile API. Send only changed fields;
  clearing a field sends `null` (the API's omitted-vs-null rule). The payload type comes from the
  route (`InferRequestType<typeof api.profile.$patch>["json"]`), not a hand-written copy.
- **Rate limiting:** set `storage: "database"` so all instances share counters. The table it
  needs comes from Better Auth's CLI — regenerate the auth schema exactly as AGENTS.md's "Auth-
  related tables are generated, never hand-edited" describes, merge the diff, then
  `pnpm db:generate && pnpm db:migrate`. Add `customRules` with stricter limits on
  `/sign-in/email`, `/sign-up/email`, `/request-password-reset`, `/send-verification-email`.
  Keep it production-only (the default) so tests and local dev aren't throttled — but add one
  integration test that turns it on explicitly and proves a sign-in burst is refused.

## Tech stack & commands

Existing stack, no new dependencies. One generated migration (rate-limit table).

```
pnpm --filter @repo/portal test
pnpm --filter @repo/api test
npx @better-auth/cli@latest generate --config packages/core/src/auth/index.ts --output packages/db/src/auth-schema.generated.ts
```

## Code style

Each section is its own component in the profile view's existing divided card, following
`features/profile/components/update-name-form.tsx` (`useAppForm` + Zod + `Alert` for errors).
Destructive actions follow `features/billing/components/cancel-subscription-button.tsx`'s
pattern: explicit `AlertDialog` confirmation, destructive button, errors shown inside the dialog.

## Testing strategy

- **Portal tests:** `api/service.test.ts` pins the exact requests (mocks only global `fetch`, like
  the billing service test); component tests mock only the service functions and `authClient`:
  - Delete: confirm button disabled until the typed email matches; success signs out; the
    only-owner 422 shows the transfer-ownership message.
  - Sessions: list renders; "this device" marked; revoke-others calls the client.
  - Personal details: only changed fields are sent; clearing sends `null`; server validation
    errors shown.
- **`apps/api` integration tests:**
  - Rate limit (explicitly enabled for the test): repeated sign-ins from one client are refused
    after the limit; a different client isn't affected.
  - Change email (after the email spec): request sends confirmation to the **new** address; the
    email only changes after confirming.
  - `DELETE /account` already has full coverage (`account.integration.test.ts`) — keep it green.

## Tasks

- [ ] **1. Personal details form** + tests.
- [ ] **2. Active sessions section** + tests.
- [ ] **3. Delete account section** + tests.
- [x] **4. Rate limiting:** moved to [security-upgrades-plan.md](./security-upgrades-plan.md)
      task 7 — it has to land after the Better Auth 1.7 upgrade (database rate-limit fix,
      GHSA-44jh-23m7-hpcf). Don't build it here.
- [ ] **5. Change email** — only after the email spec has merged; enable `user.changeEmail` with
      confirmation + form + tests.
- [ ] **6. Docs:** AGENTS.md (rate-limit storage and why; deletion uses `DELETE /account`), README
      if setup changed, CHANGELOG entry text in the PR.

## Boundaries

- **Always:** delete accounts through `DELETE /account`; require confirmation for destructive
  actions; keep rate limiting off in tests unless a test enables it on purpose.
- **Ask first:** enabling Better Auth's `deleteUser`; the exact rate-limit numbers; adding
  two-factor auth (its own spec when wanted).
- **Never:** enable `updateEmailWithoutVerification`; hand-edit the generated auth tables; show
  other users' sessions; let account deletion skip the Stripe cancellation.

## Success criteria

- A user can delete their own account from the portal; an only-owner with members is told to
  transfer ownership first, and nothing is deleted.
- A user can see their active sessions and sign out every other device.
- A user can edit phone, date of birth and address; clearing a field clears it.
- With two API instances, the sign-in limit holds across both (shared counters).
- (After email) a user can change their email, confirmed from the new address.

## Open questions

1. **Rate-limit numbers** for sign-in/sign-up/reset — suggestion: 5 per minute per client for
   sign-in and reset, 3 per minute for sign-up.
2. **Two-factor auth:** common for B2B; a separate spec (Better Auth's `twoFactor` plugin) when
   it's a priority.
3. **Grace period for deletion?** Today `DELETE /account` is immediate and permanent. Some
   products allow undo for a few days.
