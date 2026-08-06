# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project follows [Semantic Versioning](https://semver.org/) once it reaches 1.0.0 — until then, minor versions may include breaking changes.

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
