# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project follows [Semantic Versioning](https://semver.org/) once it reaches 1.0.0 — until then, minor versions may include breaking changes.

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
