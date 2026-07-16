# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/); this project follows [Semantic Versioning](https://semver.org/) once it reaches 1.0.0 — until then, minor versions may include breaking changes.

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
