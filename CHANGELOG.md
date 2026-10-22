# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project follows [Semantic Versioning](https://semver.org/) once it reaches 1.0.0 — until then, minor versions may include breaking changes.

## [0.28.0] — 2026-10-22

### Added

- Organization switcher in `apps/portal`'s nav — the last piece of `specs/customer-portal-plan.md`. Shows which account the portal is acting for (an organization, or "Personal account") and switches between them; billing and team follow the choice. Only shown to users who belong to at least one organization. Every switch invalidates all cached data, per the spec's "Org-switch cache invalidation", so billing can never keep showing the previous organization's plan — one shared `useSwitchOrganization` hook does this for both the switcher and `/team`'s "Choose an organization". Better Auth verifies membership server-side before switching.

### Fixed

- **A cancellation could be lost when two subscription events shared a timestamp.** Stripe stamps events to the second, and the out-of-order guard only applied events strictly newer than the last one — so when canceling emitted `subscription.updated` and `.deleted` in the same second and the update landed first, the cancellation was skipped and paid access kept. An event that ends the subscription now wins a same-second tie (a deleted Stripe subscription can never become active again); any other event still doesn't. Found by CodeRabbit.
- **A new subscription's events were compared with the previous subscription's.** The ordering guard's timestamp wasn't reset when checkout started a new subscription on the same billing row, so the new subscription's early events could be skipped as "older". Checkout now resets it.
- **Partial refunds were recorded as full refunds.** Stripe sends `charge.refunded` for partial refunds too; invoices now become `partially_refunded` unless Stripe reports the charge fully refunded, and a delayed partial-refund event can't downgrade a full one. Found by CodeRabbit.
- `packages/shared`'s `apiFetch` (used by both frontends) crashed on a failure body with `error: null` instead of reporting a generic HTTP error, and silently dropped caller headers passed as a `Headers` object or `[name, value]` pairs — both valid `fetch` forms. Found by CodeRabbit.
- The portal's 404 page sent "Back to Home" to `/dashboard`, which only exists in `apps/admin`. Found by CodeRabbit.
- `billing-self-service.integration.test.ts`'s setup timed out against a slow shared dev database (~10 sequential sign-up/org round trips in a 10s hook budget); given an explicit 60s budget like its sibling suites.
- The portal's account menu (Profile / Sign out) crashed the moment it opened, since 0.25.0: Base UI throws when a menu label isn't inside a menu group (`MenuGroupContext is missing`), and the label was placed directly in the menu. Nothing caught it because nothing ever opened the menu in a test. Now wrapped in a `DropdownMenuGroup` — the pattern `apps/admin` already follows — with a test that opens it.

## [0.27.0] — 2026-10-22

### Added

- `apps/portal`'s `/team` page — the third vertical slice of `specs/customer-portal-plan.md`, for organizations only (an individual account sees an explanation instead; "Team" appears in the nav only with an active organization). Lists members with their roles; owners/admins can invite someone by email with a role (member or admin) and get a shareable link — there's no invitation email yet — see and cancel pending invitations, change a member's role, and remove a member behind an explicit confirmation. No actions are offered on the owner's row or your own. Who may manage the team is checked against the same `roles` map the server enforces with (`Role.authorize()` on the caller's role from the live member list), never inferred from role names — no extra network call, and it follows role changes immediately. An org member whose session has no active organization yet (Better Auth doesn't pick one at sign-in) is offered their organizations to open, rather than being told they only have a personal account; "Team" shows in the nav for anyone who belongs to an organization. Reads come straight from Better Auth's reactive `useActiveOrganization()`, which refreshes itself after every team change. Seat-limit refusals are explained in plain words ("every seat on your plan is taken…") instead of raw error codes.
- `/auth/accept-invite?id=…` — where an invitation link lands. Signed out: sign in or create an account, then come straight back. Signed in as the invited person: see who invited you to which organization, then accept (lands on its team, now your active organization) or decline. Signed in as someone else, an expired/used invitation, or a full organization are each explained.
- Sign-in and sign-up accept a `?redirect=` so a visitor can return to where they were going (e.g. an invitation). Only same-site paths are honored (`src/lib/safe-redirect.ts`), decided by the standard URL parser rather than string-prefix checks — absolute, protocol-relative, `javascript:`, control-character tricks like `/%09/evil.example` (which browsers normalize to `//evil.example`), and dot-segment tricks like `/.//evil.example` (which the parser itself normalizes to `//evil.example`) all fall back to `/profile`, so it can't be used as an open redirect. The check is applied to the exact path returned, not just the input. Two earlier drafts in this same release were bypassable (the control-character trick, caught by code review; the dot-segment one, caught by security review) — both fixed before shipping, each with regression tests.

### Fixed

- `apps/portal/components.json` pointed shadcn's CLI at a non-existent `@/lib/utils` and the wrong stylesheet path, so `shadcn add` would have generated components that don't compile. Now `@repo/shared/utils` and `src/styles/globals.css`.

## [0.26.0] — 2026-10-21

### Added

- `apps/portal`'s `/billing` page — the second vertical slice of `specs/customer-portal-plan.md`. One page for both billing universes: with an active organization it shows that org's seat-based plan, otherwise the user's own individual plan. Shows the current plan and status, lists the plans available to switch to, starts Stripe Checkout (organizations choose a seat count, defaulting to the current member count and capped at the plan's member limit), cancels a live subscription behind an explicit confirmation, and acknowledges the `?checkout=success|cancelled` return from Stripe. Org members without `billing:manage` see the plan read-only — gated by asking the server (Better Auth's `organization.hasPermission`, backed by the same `roles` map as `requirePermission`), not by comparing role names client-side. "Billing" added to the portal nav.
- Every checkout now sends an `Idempotency-Key` — the first caller of the plumbing added in 0.22.0. One key per logical attempt (same plan, and for organizations the same seat count), reused across double-clicks and retries, regenerated only when the attempt changes, per `specs/billing-integrity-plan.md`'s Fix 2. Proven by a test that retries a failed checkout and asserts both requests carried the same key — and confirmed to fail when the hook is deliberately broken to mint a key per call.
- `GET /billing/organization-plans` and `GET /billing/individual-plans` — a customer-facing, read-only view of the plan catalog (the catalog's own `/subscription-plans` routes are platform-staff-only, so a customer previously had no way to see what they could upgrade to). Returns display fields plus `isPurchasable`, never `providerPriceId`; the organization list includes that org's own custom plans (replacing a shared plan with the same slug, matching checkout's own resolution) and never another org's. 9 new tests in `billing-self-service.integration.test.ts`, including cross-org isolation.
- `@repo/core/auth/permissions` subpath export, so client code can import the organization access-control statement without pulling in the DB-connecting `betterAuth()` instance. `apps/portal`'s `organizationClient()` now receives the same `ac`/`roles` as the server.

### Changed

- Checkout now refuses (422) while the caller already has a live subscription — previously a second checkout created a second, separately billed Stripe subscription. Organization checkout also enforces its seat count server-side: at least the current member count, at most the plan's member limit. Cancel refuses when there's no live subscription instead of calling Stripe on one that already ended.

### Fixed

- **Organizations could grow past their plan's member limit.** Owners/admins have been able to invite since 0.23.1, but nothing checked the plan's `seatLimit` on the way in — the `enforceSeatLimit` middleware existed but was never attached to any route. Seat limits are now enforced by Better Auth's own `membershipLimit` hook, checked on every accepted invitation and every server-side `addMember`, so no path to joining skips it (refusal: `ORGANIZATION_MEMBERSHIP_LIMIT_REACHED`, 403). The unused middleware is removed.
- **Canceling kept paid features forever.** When a subscription ended, the webhook only set `subscriptionStatus: "canceled"` and left `plan` on the paid tier — and entitlements and seat limits resolve from `plan`. The webhook now returns the row to the default plan when a subscription ends (keeping the subscription id for late events). Migration `0020_reset_ended_subscription_plans.sql` backfills rows that were already canceled. This also let a canceled customer re-buy the same plan in the portal, which previously still showed it as their "current plan" with no way to choose it.
- The customer plan list could offer a shared plan that checkout would always reject — when an org's own custom plan with the same slug had been retired. The custom-vs-shared precedence rule now lives in one function (`applyCustomPlanPrecedence`) used by both checkout's plan lookup and the list.
- The billing page re-showed "Cancel subscription" right after a cancel (one refetch landed before Stripe's webhook did), inviting a second cancel. It now hides the button and polls briefly until Stripe confirms. Plans too small for the organization's current team are shown as unavailable rather than offered, and the plan summary no longer claims "free plan" for a plan staff arranged outside checkout.
- The API's CORS config didn't allow the `Idempotency-Key` request header, so a browser's preflight would have blocked every cross-origin checkout from `apps/portal` before it was sent — invisible to the portal's unit tests, which mock `fetch`. Added to `allowHeaders` in `app.ts`, with an integration test that sends a real preflight.
- `BILLING_CHECKOUT_RETURN_URL`'s default (and `.env.example`/CI) pointed Stripe's post-checkout redirect at `http://localhost:3000/billing` — `apps/admin`, a staff-only app with no billing page. Now `http://localhost:3002/billing` (`apps/portal`). If your own `.env.development` sets this variable, update it.

## [0.25.0] — 2026-08-07

### Added

- `apps/portal` — the customer-facing frontend from `specs/customer-portal-plan.md`: sign-up, sign-in, and a self-service profile page (name/password), on the same Next.js 16/Tailwind v4/shadcn stack as `apps/admin`, running on its own origin (`localhost:3002` in dev). `organizationClient()` only — no `adminClient`/platform roles, since this audience is never platform staff. `proxy.ts` gates `/profile`/`/billing`/`/team` on session-cookie presence (same presence-only pattern as `apps/admin`'s, real enforcement stays server-side), with `/auth/accept-invite` deliberately excluded from the "already signed in, bounce to /profile" rule — an existing member must be able to reach it to accept an invitation to a second org. `ALLOWED_ORIGINS` now includes the new origin so `apps/api` accepts it. Billing and team-management pages are not yet built — profile is the first vertical slice, proving the app boots, builds, and does a real sign-up/sign-in round trip against `apps/api` end to end (verified live, not just unit-tested, same standard as the original admin sign-in flow).
- New `packages/shared` (originally scaffolded as `packages/ui`, renamed before anything else depended on it — "ui" implies visual components, which deliberately never live here; shadcn primitives are vendored per-app instead) — the two-line `apiFetch`/`ApiError`/`getQueryClient`/`cn`/`formatBytes` grab-bag both `apps/admin` and `apps/portal` need, extracted from `apps/admin/src/lib/*`. `apps/admin`'s own 86 call sites were repointed at the new package with zero behavior change (confirmed via its full existing test suite passing unmodified).

## [0.24.0] — 2026-08-06

### Added

- Self-service billing routes in `apps/api`, closing the second gap from `specs/customer-portal-plan.md`'s gap audit (team management was the first, see 0.23.1): `GET /billing/organization` (any active-org member, read-only plan/status/seat count — no internal Stripe ids exposed), `GET /billing/individual` (ownership-based), `POST /billing/organization-cancel` (owner/admin only, `billing:manage`), `POST /billing/individual-cancel` (ownership-based). Cancellation calls Stripe directly but deliberately does not write `subscriptionStatus` on the local row or insert into the `billing_events` ledger itself — the existing `customer.subscription.deleted`/`.updated` webhook path remains the single writer of subscription lifecycle state (same "call the gateway, let the webhook be the source of truth" shape already used by `account.service.ts`'s deletion-time cancellation), since the ledger's idempotency guarantee is keyed on a real Stripe `stripeEventId`, which a user-initiated action doesn't have. New `billing-self-service.integration.test.ts` (17 tests) covers auth/permission guards, default-plan responses, the no-subscription short-circuit, and — since these routes carry no `:organizationId`/`:userId` param and resolve everything from the caller's own session — explicit cross-tenant/cross-user isolation proofs: a real, authenticated owner of a different organization can never see or affect another org's billing, and a different real account can never see or affect another user's individual billing.

## [0.23.1] — 2026-08-06

### Fixed

- Team management (invite/remove/change role) was silently denied for every organization role, including owner — `packages/core/src/auth/permissions.ts`'s custom access-control statement replaced Better Auth's own organization-plugin defaults instead of merging with them, and the replacement never re-granted the `member`/`invitation` resources those routes check. Added `member: ["create", "update", "delete"]` and `invitation: ["create", "cancel"]` to `ownerRole`/`adminRole` (mirroring Better Auth's own default `ownerAc`/`adminAc`), left `memberRole` unchanged. This was the blocker called out in `specs/customer-portal-plan.md`'s gap audit — first step of building `apps/portal`. New `organization-permissions.integration.test.ts` proves the real Better Auth routes (`/organization/invite-member`, `/accept-invitation`, `/remove-member`, `/update-member-role`) end to end: an owner can invite someone by email and have them accept and become a member, an owner can remove a member and change another member's role, and a plain member is denied on all three (403/401/403 respectively, matching each route's own error code).
- CI: `pnpm db:migrate` failed on a fresh database with "role app_user does not exist" — the new `billing_events` immutability migration (0.22.0) is the first migration to reference the `app_user` role by name (`REVOKE UPDATE, DELETE ... FROM app_user`) rather than only through an RLS policy's `current_setting(...)` check, but CI created that role in a step that ran _after_ migrations. Reordered `.github/workflows/ci.yml` to create the role first. Also added a "Seed subscription plans" CI step — a related, previously-hidden gap where `entitlement.integration.test.ts`'s paid-tier upgrade cases always fell through to deny-most entitlements on a genuinely fresh database, since only the two free-tier plans are seeded by migration; the paid tiers `apps/api/scripts/seed-subscription-plans.ts` adds had only ever existed in a manually-seeded local dev database. Both gaps were only exposed once CI's `test` job could run to completion for the first time. `README.md`'s quickstart and `AGENTS.md` updated to match.

## [0.23.0] — 2026-08-06

### Added

- Platform staff can now see billing history directly on an organization's or individual's detail page in `apps/admin` — a new "Billing History" section (date, plan, amount, status, link to Stripe's hosted receipt) backed by the `invoices` table added in 0.22.0. `GET /platform-organizations/:organizationId` and `GET /platform-individuals/:userId` both now return an `invoices` array, following the same pattern as the existing `members`/`organizations` fields — no new route, permission tier, or endpoint needed. New shared `apps/admin/src/components/billing-history-table.tsx`, reused by both the organization and individual billing tabs since the underlying row shape is identical for both.

## [0.22.0] — 2026-08-06

### Added

- Billing integrity: an append-only `billing_events` ledger, a curated `invoices` table, and two webhook-ordering correctness fixes — see `specs/billing-integrity-plan.md` for the full design. Previously, `organization_billing`/`individual_billing` were pure current-state snapshots with no history, no inbound webhook idempotency, and no record of an actual completed transaction.
  - `billing_events` records every Stripe webhook event this app receives, verbatim, keyed on Stripe's own event id — a duplicate delivery (Stripe's webhooks are at-least-once, not exactly-once) now inserts nothing and is skipped rather than reprocessed, closing a real gap where a retried `past_due` delivery would have re-fired a duplicate staff notification. Immutable at the Postgres grant level (`REVOKE UPDATE, DELETE ... FROM app_user`), not just by convention.
  - `invoices` is a curated, one-row-per-transaction receipt record (plan, amount, currency, Stripe's hosted invoice URL) derived from `invoice.paid`/`charge.refunded` — the future home of a "billing history" view, distinct from the raw event ledger.
  - Expanded webhook event coverage: `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, and `charge.dispute.created` are now mapped and recorded — previously silently dropped, including refunds and chargebacks, which were completely invisible to this system.
  - Out-of-order delivery guard: Stripe delivers webhooks at-least-once but not in order. `organization_billing`/`individual_billing` gained a `lastEventAt` column, and every lifecycle update is now conditional on the incoming event's own timestamp — a delayed retry of an older event can no longer overwrite a row a newer event already corrected.
  - Refund-before-invoice race guard: a `charge.refunded` arriving before its `invoice.paid` (a real possible ordering, not swallowed) now fails loudly and rolls back rather than silently dropping the refund, relying on Stripe's own retry schedule to redeliver once the invoice exists.
  - Documented (not yet wired up, since no real "Subscribe" button exists anywhere in this repo yet): the backend already threads an optional `Idempotency-Key` through to Stripe's checkout-session creation, but nothing has ever sent it — whichever frontend builds the first real checkout button must generate one per attempt.

## [0.21.1] — 2026-08-06

### Fixed

- CI's `test` job (`.github/workflows/ci.yml`) failed on a fresh database: `subscription_plans` had zero rows, since the "free" (organization) and "individual_free" (individual) default plans only ever existed in this repo's own long-lived dev database, created by hand at some point rather than by a migration. Every "no billing row yet" entitlement fallback (`entitlement.middleware.ts`/`seat-limit.middleware.ts`) resolves to whichever plan has `isDefault: true` — with no such row, upgraded-plan checks kept 402ing and `GET /subscription-plans` never listed a "free" plan. Added `packages/db/migrations/0017_seed_default_subscription_plans.sql`, an idempotent data migration (`ON CONFLICT` targets the existing partial unique index) that seeds both default plans on any fresh database, verified safe against this repo's own already-seeded dev database too.
- `account.integration.test.ts`'s sole-owner-blocked deletion test was missing the explicit longer timeout its sibling test right above it already has, and intermittently exceeded vitest's default 5000ms under the shared dev database's real request latency — same class of flake already fixed once in the notifications test suite.

## [0.21.0] — 2026-08-06

### Added

- Self-service account profile (`apps/admin`'s `/dashboard/profile`, `features/profile/`) — any signed-in user can now update their own display name and change their own password, using Better Auth's existing `updateUser`/`changePassword` client endpoints directly (both already scope to the caller's own session; no new `apps/api` endpoints were needed). Fixed the sidebar's bottom account menu (`components/nav-user.tsx`), which previously rendered a static "Account" label with a hardcoded "Sign in to manage your account" placeholder and no working logout — it now shows the real signed-in user's avatar/name/email and has working "Profile" and "Log out" actions. Removed the sidebar's separate template-leftover "Account" nav group (a redundant "Notifications" link plus a dead "Login" link) — notifications live in the header bell, and account actions live in the one account menu, not duplicated across three places.

### Changed

- Deleted `components/layout/user-nav.tsx`, a dead stub (`return null`) left over from the same template cleanup.

## [0.20.0] — 2026-08-04

### Added

- Production-grade notification system (`apps/api/src/modules/notifications/`, `packages/db`'s `notification` table, `packages/core`'s `NotificationChannel`/`NotificationRecord` types). Persist-then-push durability: every notification is written to the database first (the source of truth), then pushed over the existing WebSocket dispatcher as a best-effort convenience — a delivery failure never loses the notification, since it's already durably stored and reachable via `GET /notifications` on the next real fetch. Channel delivery is behind a `NotificationChannel` interface so email/push/SMS can be added later as one new class + one array entry in `notifications.service.ts`, with zero changes to `notifyUser`/`notifyUsers` or any trigger call site. First real trigger wired in: a Stripe `subscription_updated`/`subscription_canceled` webhook landing on `past_due` or `canceled` now notifies every platform staff account, with a deep link to the affected organization's or individual's admin page — currently the only trigger with a reachable audience, since `apps/admin` has no customer-facing surface yet for an org member or individual to see their own notifications. `apps/admin`'s notification bell and `/dashboard/notifications` page now run on this real data (via a new `features/notifications/api` layer and a `useNotificationSocket()` hook) instead of the previous hardcoded mock Zustand store, which is now removed.

## [0.19.0] — 2026-08-04

### Added

- Admin-managed subscription plan catalog (`apps/api/src/modules/subscription-plans/`, `apps/admin`'s `/dashboard/subscription-plans`) — platform admins can now create/edit shared and custom (per-organization) plans, toggle known features, and set known limits without a deploy, replacing the previous hardcoded `organizationPlans`/`individualPlans` maps. Plan ids are now admin-editable strings, not a closed compile-time union; the closed vocabulary that matters (`FeatureKey`/`PlanLimitKey`) stays in code and is re-validated on every read, not just at the write boundary. Stripe Price IDs are verified live against Stripe before a plan is ever saved. No hard delete — `isActive: false` retires a plan without affecting existing subscribers. See `specs/subscription-management-plan.md` for the full design.

### Changed

- `BillingGateway.createCheckoutSession`/`createIndividualCheckoutSession` now take an already-resolved `providerPriceId` instead of looking up a plan internally — the vendor adapter (`stripe-billing.service.ts`) has zero dependency on the plan catalog now. New `billing.service.ts` resolves a plan and its price before calling the gateway.
- `entitlement.middleware.ts`/`seat-limit.middleware.ts` resolve entitlements/seat limits from the database plan catalog instead of a hardcoded map, including the "no billing row yet" fallback (now the plan flagged `isDefault`, not a literal `"free"`/`"individual_free"` string).

### Fixed

- `apps/admin`'s "Users" platform-staff page renamed to "Staff" throughout (nav, route, page title, breadcrumb, and every internal identifier) — the old label was easily confused with the separate "Individuals" (real customers) page.
- Platform Individuals list gained faceted filters (plan, billing status, "no organization association") matching the Staff table's existing role-facet pattern.

## [0.18.0] — 2026-07-25

### Added

- Platform employees feature — a platform admin can now add other staff directly (`authClient.admin.createUser`, no self-signup/invite-email flow), assign one of two roles (`admin`, `support`), and change role/ban/unban/remove from `apps/web`'s `/dashboard/users` page. Two platform roles now exist: `admin` (full access, identical to Better Auth's own default admin permissions) and `support` (read-only — list/view users only). Page is gated client-side to these two roles via `PlatformAccessGate`; the real enforcement stays server-side on every `authClient.admin.*` call.

### Changed

- `packages/core/src/auth/index.ts`'s `admin` plugin config now passes a custom `roles`/`ac` (`platform-permissions.ts`) instead of relying on the plugin's built-in defaults — required to add the `support` tier. Verified this exactly replicates the existing default admin role's permissions so the already-bootstrapped admin account keeps identical access, not a silent downgrade.
- `apps/web`'s `/dashboard/users` (`src/features/users/`) fully replaced the template's fake in-memory user data with real `authClient.admin.*` calls. Deleted the now-dead `app/api/users/**` route handlers; `src/constants/mock-api-users.ts` now only exports `delay` (still used by the overview dashboard's mock chart pages).

## [0.17.0] — 2026-07-25

### Fixed

- Shared `Form` component (`apps/web/src/components/ui/tanstack-form.tsx`) was silently discarding any custom `className` passed to it — `{...props}` spread after the merged `className`, and `className` was never excluded from `props`'s type, so React's prop resolution let the raw value win. Affected every form in the app; margin/gap utilities on any `form.Form` had zero effect.

### Added

- `pnpm --filter @repo/api seed:admin` (`apps/api/scripts/seed-admin.ts`) — idempotent platform-admin seeding from `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`/`SEED_ADMIN_NAME`, an operator-friendly alternative to `ADMIN_USER_IDS`.

### Verified

- Sign-in flow confirmed working end-to-end against the real dev servers (not just the test suite): real sign-up/sign-in through the exact endpoints `authClient` uses, CORS genuinely exercised with a real `Origin` header, session cookie authenticates a real route, wrong password correctly rejected.

## [0.16.0] — 2026-07-25

### Fixed

- A Zod `.default()` on a field TanStack Form's `defaultValues` already supplies (`rememberMe`) was silently breaking `next build`'s type-check.
- Shared `CheckboxField` label had no `htmlFor`, so clicking "Remember me"'s label text didn't toggle the checkbox — only the small checkbox itself did.

### Changed

- Icon-affordance and password-visibility-toggle support moved into the shared `TextField`/`FormTextField` (new optional `icon`/`labelSuffix` props) instead of living as feature-local duplicates in the sign-in form. Existing plain text fields elsewhere are unaffected (same markup as before). `sign-in-view.tsx` now composes only prebuilt field components.

## [0.15.0] — 2026-07-25

### Added

- `apps/web/src/lib/api-client.ts` — shared `apiFetch<T>` for calling `apps/api`, replacing the template's original stub. Matches the real success/failure envelope, throws a typed `ApiError` (`code`/`message`/`status`) instead of a bare `Error`. Built test-first (`api-client.test.ts`).

### Changed

- Sign-in form (`/auth/sign-in`) redesigned: icon-affordance inputs, password show/hide toggle, autofocus/placeholder/autocomplete polish, loading-aware submit label, and a corrected mobile layout (the first pass's aesthetic redesign only showed at desktop width, leaving mobile as a bare, unstyled form).

### Housekeeping

- Mirrored a repo-root skill (`nextjs-shadcn-frontend`) from `.agents/skills/` into `.claude/skills/` — the latter is what this harness actually scans for slash-invokable skills; every other skill in the repo already existed in both.

## [0.14.0] — 2026-07-25

### Fixed

- `apps/web`'s `src/proxy.ts` was a no-op left over from the Clerk removal — the dashboard was reachable with no login at all. Now redirects unauthenticated `/dashboard/**` requests to `/auth/sign-in` (and an authenticated session away from `/auth/**` to `/dashboard/overview`), via `getSessionCookie` (`better-auth/cookies`). Built test-first, `proxy.test.ts`. See `AGENTS.md`'s "apps/web" section — including a correction of a wrong claim in the `next-best-practices` skill about the config export name.

## [0.13.0] — 2026-07-25

### Added

- `apps/web` — a Next.js 16 + shadcn/ui admin dashboard, vendored from [next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) (MIT) and adapted into this monorepo: Clerk/Sentry/kanban/chat/demo-examples removed via the template's own cleanup tool, package renamed `@repo/web` and wired into the pnpm workspace (own `eslint.config.mjs` hand-built around `eslint-plugin-react`'s ESLint-10 incompatibility, `.gitignore` trimmed to what root doesn't already cover), Vitest + React Testing Library added for component tests. First real feature: `/auth/sign-in`, built test-first against Better Auth's own React client (`src/lib/auth-client.ts`) — no Next.js API-route proxy in between, straight `fetch` to `apps/api`. See `AGENTS.md`'s new "apps/web" section.

## [0.12.0] — 2026-07-25

### Added

- Platform admin backend, via Better Auth's own `admin` plugin (`packages/core/src/auth/index.ts`) — no custom system, no UI yet. Adds `user.role`/`banned`/`banReason`/`banExpires` and `session.impersonatedBy` (migration `0011_uneven_rick_jones.sql`). Every `/api/auth/admin/**` endpoint (list/create/update users, set-role, ban/unban, impersonate, revoke sessions, etc.) is now live through the existing auth proxy. `ADMIN_USER_IDS` env var bootstraps the first admin. See `AGENTS.md`'s "Platform admin" section.

## [0.11.0] — 2026-07-25

### Added

- `DELETE /organization` — permanently deletes the caller's active organization (billing, profile, memberships, pending invitations). Owner-only. Never touches any member's own account — deleting an org only ends membership, not any individual's personal data, since GDPR's right to erasure belongs to each data subject, not the org they belong to. See `AGENTS.md`'s "Organization deletion" section.

### Fixed

- Corrected a wrong claim from `0.8.0`'s account-deletion work: `ON DELETE CASCADE` is not subject to Row-Level Security in Postgres at all (confirmed directly against the database), contrary to what was documented and built around at the time. Simplified `account.service.ts`/`account.db.ts` accordingly — the explicit pre-deletion of RLS-protected child rows before their parent was never actually necessary; cascade alone was always sufficient.

### Changed

- `requirePermission` no longer calls `auth.api.hasPermission(...)` — that re-derived the session and re-fetched the member's role from the DB, both already resolved earlier in the same request by `injectUserContext`. Now calls the same underlying `Role.authorize()` (a pure, synchronous, in-memory check) directly. No behavior change, one fewer DB round-trip per permission-gated request.

## [0.10.0] — 2026-07-25

### Fixed

- WebSocket dispatcher: a second connection for the same user (a second tab/device) used to silently overwrite the first's registration, and closing the _first_ connection then deleted the _second_'s still-open entry — a live socket left permanently unreachable. Reproduces with one user and two tabs; not a scale-only issue. Fixed with `Map<string, Set<WSContext>>` instead of one connection per user.
- Postgres pool now has explicit, env-driven `max`/timeouts (`DB_POOL_MAX`/`DB_POOL_IDLE_TIMEOUT_MS`/`DB_POOL_CONNECTION_TIMEOUT_MS`) instead of node-postgres's defaults (`max: 10`, wait-forever connection timeout), plus a `pool.on("error", ...)` handler — an unhandled error on an idle pooled client otherwise crashes the whole process.
- Added graceful shutdown on `SIGTERM`/`SIGINT` — drains in-flight requests and closes the DB pool before exit, instead of a deploy/scale-down signal killing the process mid-request.
- Stripe checkout creation now accepts an optional `Idempotency-Key` request header, passed through to Stripe — protects against a retried checkout request minting a duplicate session, which the Stripe SDK's own auto-generated per-call key does not (it only protects the SDK's internal network-retry).

### Changed — **breaking**

- `NotificationDispatcher.removeClient` (`packages/core`) now takes `(userId, client)` instead of `(userId)` — required to distinguish which of a user's possibly-multiple live connections closed. Any custom `NotificationDispatcher` implementation needs updating.

## [0.9.0] — 2026-07-25

### Added

- Organization profile: industry, company size, website, phone, tax ID, description, structured address, and `orgNumber` — a permanent, human-friendly, unique, indexed org identifier (not a join/invite credential — see `AGENTS.md`). `GET`/`PATCH /organization-profile`, RLS-enabled, owner/admin-only edits via a new `organizationProfile: ["manage"]` permission. Unlike every other table in this app, the profile row is created eagerly at org creation (a real, verified Better Auth `afterCreateOrganization` hook), not lazily on first access. See `AGENTS.md`'s "Organization Profile" section.

## [0.8.0] — 2026-07-24

### Added

- `DELETE /account` — permanent, self-service account deletion. Blocks (422) if the caller is the sole owner of an organization that still has other members; deletes a solo-owned organization along with the account otherwise. Best-effort cancels any live Stripe subscription first. See `AGENTS.md`'s "Account deletion" section.

### Fixed

- Discovered and fixed a real bug while building account deletion: `ON DELETE CASCADE` through a `FORCE ROW LEVEL SECURITY`-protected table runs unscoped and gets blocked by the fail-closed policy, turning a clean delete into a foreign-key-violation error. RLS-protected rows (`profile`, `individual_billing`, `organization_billing`) are now explicitly deleted through the existing scoped helpers before their parent row, instead of relying on cascade.

## [0.7.0] — 2026-07-24

### Added

- User profile: `phone`, `dateOfBirth`, and a structured address, `GET`/`PATCH /profile` — a new `profile` table (RLS-enabled, FK'd to `user.id`), ownership-scoped for both B2C and B2B2C. `PATCH` is a real partial update (omitted field = unchanged, explicit `null` = cleared). See `AGENTS.md`'s "User Profile" section.

### Changed

- Route handler discipline tightened repo-wide: every route handler (including `app.ts`'s `/health`/`notFound`/`onError`) is now a named function in a `.controller.ts`/`lib/app-handlers.ts`, never an inline closure in `.routes.ts`/`app.ts` — no behavior change, pure refactor. See `AGENTS.md`'s rewritten route handler discipline rule.

## [0.6.0] — 2026-07-24

### Added

- In-house feature entitlement system for gating routes/capabilities behind a subscription plan, zero external dependencies — `PlanEntitlements`/`BillingOwner`/`canAccessFeature`/`getPlanLimit` (`packages/core/src/billing/entitlements.ts`), and one `requireFeature(feature, scope)` Hono middleware (`apps/api/src/middleware/entitlement.middleware.ts`) covering both organization and individual billing. `scope` is a required argument, never inferred from session mode — see `ENTITLEMENTS.md` for the full design and why that matters.

## [0.5.0] — 2026-07-24

### Added

- Individual (B2C) Stripe billing, alongside existing organization billing — a separate `individual_billing` table (FK'd to `user.id`, no seat concept, own `individualPlans` tier map), `POST /billing/individual-checkout` (ownership-scoped via `injectUserContext` only, works for any session with a user), and `createIndividualCheckoutSession` on `BillingGateway`. The shared `POST /billing/webhook` normalizes into a `BillingEvent` discriminated on `ownerType: "organization" | "individual"` and routes to the correct table — see `AGENTS.md`'s Billing model section.
- Row-Level Security on `individual_billing` too, via a new `withUserScope` helper alongside the existing `withOrgScope`/`withSystemScope` — same pattern, same real proof test (`individual-billing.integration.test.ts`), including a dedicated check that an individual checkout's webhook event never writes to `organization_billing`.

### Changed — **breaking**

- `POST /billing/checkout` renamed to `POST /billing/organization-checkout`, now that there are two checkout flows and the old name was ambiguous.
- Database tables renamed (data-preserving `RENAME TO`, not drop+recreate): `billing` → `organization_billing`, `user_billing` → `individual_billing`. Anyone with an existing deployment on `0.4.0` needs to run the new `0005_rename_billing_tables.sql` migration.

### Fixed

- `providerSubscriptionId` is now `UNIQUE` on both `organization_billing` and `individual_billing` (migration `0006_bored_paibok.sql`), closing a defense-in-depth gap flagged (but filtered as non-exploitable) by `/security-review` — see `SECURITY_AUDIT.md`.
- `create-app-role.js` now rejects an `APP_ROLE_PASSWORD` containing its own dollar-quote tag instead of relying on that never happening.

## [0.4.0] — 2026-07-24

### Added

- Row-Level Security on the `billing` table — defense-in-depth on top of (not instead of) existing app-level auth checks. `withOrgScope`/`withSystemScope` transaction helpers (`packages/db/src/index.ts`), `packages/db/scripts/create-app-role.js` to provision the restricted DB role this requires, and a real proof test (`billing.integration.test.ts`) that an unscoped or wrong-org query returns nothing. See `AGENTS.md`'s new Row-Level Security section for the full pattern — required reading before adding RLS to any other table.

### Fixed

- The app's DB connection role (Neon's default owner role) had `BYPASSRLS` granted directly on it, which made the RLS policy above completely inert despite `FORCE ROW LEVEL SECURITY` being set — `FORCE` only overrides table-owner exemption, not a role-level `BYPASSRLS` grant. Caught by the new proof test failing on its first run, not assumed to be fine. Fixed by introducing a second, restricted role for runtime queries.

### Changed — **breaking**

- New required env var `APP_DATABASE_URL` (a restricted DB role, no `BYPASSRLS`) — `packages/db/src/index.ts` now throws at import time if it's unset, rather than silently using `DATABASE_URL`'s owner role for runtime queries. `DATABASE_URL` is now used only for migrations. Any existing deployment needs to provision this role (`pnpm --filter @repo/db create-app-role`) and set the new var before upgrading.

## [0.3.0] — 2026-07-17

### Added

- Seat-based Stripe billing: a vendor-agnostic `BillingGateway` contract (`packages/core/src/billing/types.ts`) with a `StripeBillingService` adapter (`apps/api/src/modules/billing/`) — switching payment vendors touches only that one adapter file, never a route. `POST /billing/checkout` (owner/admin only) and `POST /billing/webhook` (signature-verified, normalized before touching the DB), plus `enforceSeatLimit` middleware that blocks org actions once active member count reaches the plan's seat limit. New `billing` table, FK'd to `organization.id`. Verified against the real (test-mode) Stripe API and a real signed webhook round trip — see PROGRESS.md.
- Permanent integration test for the billing routes (`billing.integration.test.ts`): auth/permission gates, real Stripe checkout call, and webhook signature verification + DB update via a self-signed payload.
- New `PAYMENT_REQUIRED` (402) error code.
- `POST /billing/checkout`'s request body is now validated via `@hono/zod-validator`'s `zValidator` as route middleware (a real pre-route guard) instead of a `.safeParse()` call inside the handler — the new standard pattern for any route with a body/query, documented in `AGENTS.md`.

### Fixed

- `pnpm db:generate`/`pnpm db:migrate` never actually loaded `DATABASE_URL` (no `--env-file` wired) — silently relied on it already being in the shell's environment. Now loads `.env.development` itself.

### Changed

- `.routes.ts` files now hold only route registration, named middleware, and a thin handler — no inline orchestration, no inline anonymous guard closures, no more than one real call in a handler body. `billing.routes.ts`'s webhook route used to do signature-check + parse + conditional dispatch inline (three steps); now it's one call to `billing.handlers.ts`'s new `processWebhook`. Its checkout route used to inline a B2B2C mode-check before calling the billing service; now it's `requireOrgContext` (new export from `auth.middleware.ts`) doing that narrowing in one call. `notifications.routes.ts`'s inline origin-check and self-user-id closures moved to new reusable middleware, `apps/api/src/middleware/origin.middleware.ts` (`requireAllowedOrigin`) and `self-param.middleware.ts` (`requireSelfParam`). No behavior change — same 17 tests pass throughout, proving each extracted code path still works. New hard rule in `AGENTS.md`, including the one standing exception (`requireOrgContext`-style type-narrowing calls don't count against the "one call" rule).

## [0.2.0] — 2026-07-17

### Added

- Sentry production error monitoring (`@sentry/hono`/`@sentry/node`), initialized in `apps/api/src/instrument.ts` and gated entirely behind the optional `SENTRY_DSN` env var — a no-op when unset, so local dev needs no Sentry account. Unexpected (non-`AppError`) exceptions are reported via `Sentry.captureException` from the existing centralized `app.onError` handler.

### Fixed

- `/ws/:userId` now validates the `Origin` header against `ALLOWED_ORIGINS` before completing the handshake, closing a cross-site WebSocket hijacking gap: WS handshakes aren't covered by CORS the way `fetch` is, so this was previously relying only on the session cookie's `SameSite=Lax` default rather than a server-side check.

### Changed

- `@repo/db` now re-exports `eq` from `drizzle-orm` so consumers never need their own direct `drizzle-orm` dependency — avoids pnpm resolving a divergent peer-dependency instance of `drizzle-orm` in a different workspace package (surfaced by adding Sentry's `@opentelemetry` transitive deps to `apps/api`).

## [0.1.0] — 2026-07-16

Initial public release. This is the reusable SaaS foundation, not a finished product — see [PROGRESS.md](./PROGRESS.md) for exactly what's implemented vs. planned.

### Added

- Monorepo scaffold: pnpm workspaces + Turborepo, `apps/api` (Hono) / `packages/db` (Drizzle) / `packages/core` (domain logic).
- Multi-tenant auth via Better Auth: email/password sign-up/sign-in, and an Organization plugin giving individual (B2C), organization member, and organization owner identities.
- Permission-based access control (`requirePermission` middleware) — checks actual permissions via Better Auth's own access-control system for org members, not hand-rolled role-string comparisons; individual users are handled via ownership checks instead of a role lookup.
- Consistent API response envelope (`{ success, data }` / `{ success, error }`) with environment-aware error verbosity — stack traces and internal details only outside production.
- Hardened Hono middleware chain by default: `secureHeaders`, `cors` (env-driven, synced with Better Auth's `trustedOrigins`), `bodyLimit`, `etag`, `logger`.
- Environment detection driven entirely by which command runs (`dev`/`start`/`test`), via `cross-env` + per-mode `.env.*` files — no ambiguity about which config is active.

### Known gaps (see PROGRESS.md)

- No example feature/route built on top of the foundation yet.
- Invitation flow (email-based org invites) implemented by Better Auth but not yet exercised end-to-end.
- No OpenAPI documentation.
