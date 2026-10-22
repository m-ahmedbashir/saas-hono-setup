# SaaS foundation — remaining specs (start here)

This folder holds one spec per workstream. **Every agent reads this file first, then only
its own spec.** It explains what already exists, what each remaining spec covers, which can
run in parallel, and the rules every workstream follows.

Status: drafted 2026-10-22 against version 0.28.0. Each spec's facts were checked against the
installed `better-auth@1.6.23`, `@better-auth/core@1.6.23` and `stripe@22.3.2` source — re-check
if those versions change.

## What already exists (don't rebuild)

See [ARCHITECTURE.md](../ARCHITECTURE.md) for the picture and [PROGRESS.md](../PROGRESS.md) for
detail. In short:

- **Identity:** Better Auth email + password, organizations with `owner`/`admin`/`member` roles
  (`packages/core/src/auth/permissions.ts`), platform staff roles (`admin`/`support`).
- **Customer portal (`apps/portal`):** sign-up/in, profile (name, password), billing (view,
  checkout, cancel), team (invite by link, roles, remove), accept-invite, organization switcher.
- **Billing:** Stripe Checkout + verified webhooks, `billing_events` ledger, invoices, plan
  catalog (`subscription_plans`), entitlements (`requireFeature`), seat limits (Better Auth's
  `invitationLimit`/`membershipLimit` hooks).
- **API already built but with no customer UI yet:** `DELETE /account`, `DELETE /organization`,
  `GET`/`PATCH /profile` (phone, date of birth, address), `GET`/`PATCH /organization-profile`.
- **Staff app (`apps/admin`)**, notifications (persist-then-push), RLS, CI.

## The remaining common SaaS basics

| Spec                                                                             | What a user gets                                                           | Depends on                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [email-and-account-recovery-plan.md](./email-and-account-recovery-plan.md)       | Forgot/reset password, email verification, invitation emails               | —                                                          |
| [organization-self-serve-plan.md](./organization-self-serve-plan.md)             | Create an organization, org settings, leave, transfer ownership            | —                                                          |
| [stripe-customer-portal-plan.md](./stripe-customer-portal-plan.md)               | Stripe-hosted plan changes, card updates, cancel at period end, buy seats  | —                                                          |
| [account-security-and-settings-plan.md](./account-security-and-settings-plan.md) | Delete my account, active sessions, change email, production rate limiting | Change email needs the email spec; everything else doesn't |

**Deliberately not specced yet** (don't build ahead — AGENTS.md's ground rule): audit log, SSO
and social login, two-factor auth, API keys, outbound webhooks, customer-facing notifications,
onboarding flow, GDPR data export, i18n. Write a spec when one becomes the next priority.

## Running them in parallel

The first three specs touch different files and can run as **three parallel agents**, each on
its own branch created from `develop` (e.g. `feature/email-account-recovery`,
`feature/org-self-serve`, `feature/stripe-customer-portal`). Start the fourth once email has
merged, or start it in parallel and leave its "change email" task for last.

Known overlap to coordinate:

- **`packages/core/src/auth/index.ts`** (the `betterAuth()` config) — touched by email (hooks)
  and account security (rate-limit storage). Merge one before rebasing the other; both need
  human review because this file affects `apps/admin` too.
- **`packages/core/src/auth/permissions.ts`** — organization self-serve adds permissions.
- **Shared release files** — `CHANGELOG.md`, every workspace `package.json` version,
  `PROGRESS.md`, `AGENTS.md`. **Agents don't bump versions.** Each agent writes its changelog
  entry and doc notes in its PR description; the person merging applies them once, so parallel
  branches don't conflict on these files.

## Rules every workstream follows

1. **Read before coding:** [AGENTS.md](../AGENTS.md) (the rules — it overrides anything here),
   [ARCHITECTURE.md](../ARCHITECTURE.md), then your spec. Don't read the other specs unless yours
   points to them.
2. **Spec first, then code.** Your spec is approved for its stated scope. Its **Open questions**
   must be answered by the human before the task they block — ask, don't guess. Anything not in
   the spec is out of scope: propose a spec change instead of building it.
3. **Verify, don't assume.** Before relying on a library behaviour, confirm it in the installed
   source (`node_modules/.pnpm/<package>@<version>/...`) and say so in a code comment or the PR.
   The specs record facts verified at writing time; if the installed source disagrees, the
   source wins — update the spec.
4. **Test first** (`test-driven-development` skill): write the failing test, watch it fail for
   the right reason, then implement. Server security boundaries get integration tests in
   `apps/api` (`*.integration.test.ts`, real server + DB, self-cleaning) that prove both
   directions — allowed **and** refused. UI gets Vitest + React Testing Library tests that mock
   only I/O (network, `next/navigation`, Better Auth client calls).
5. **Follow the existing patterns**, named in each spec — interface in `packages/core`,
   implementation in `apps/api`; `.routes.ts` → `.controller.ts` → `.service.ts` → `.db.ts`;
   Zod validation with the envelope hook; `withOrgScope`/`withUserScope` for RLS tables; the
   portal's design-system components (no hand-rolled controls, no raw colours).
6. **Small vertical slices.** One task = one working, tested increment. Run the checks after
   each task, not only at the end.
7. **Review before the PR:** run `/code-review` and `/security-review` on the branch; verify
   each finding against the code; fix the real ones (test-first) and note why any are rejected.
8. **Never:** commit secrets or `.env.*` files; bypass the pre-commit hook (`--no-verify`); call
   `stripe` outside `stripe-billing.service.ts`; query an RLS table with the bare `db` client;
   compare role names instead of checking permissions; weaken or delete a failing test to make
   it pass.

## Definition of done (every spec)

- Every task in the spec is done, or explicitly moved to its Open questions with a reason.
- All checks pass from the repo root:

  ```
  pnpm format:check        # on Windows with core.autocrlf=true, check changed files with
                           # prettier --end-of-line auto --check instead (see PROGRESS.md)
  pnpm turbo run lint
  pnpm typecheck
  pnpm turbo run build
  pnpm --filter @repo/api test -- --no-file-parallelism
  pnpm --filter @repo/portal test
  pnpm --filter @repo/admin test
  pnpm --filter @repo/core test
  pnpm --filter @repo/shared test
  ```

- `/code-review` and `/security-review` run, findings resolved.
- The spec's Success criteria are each demonstrably true (test name or manual check listed in
  the PR).
- README updated for any new env var, script or setup step; the PR description carries the
  CHANGELOG entry and AGENTS.md/PROGRESS.md notes for the merger to apply.
