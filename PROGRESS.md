# PROGRESS.md

Point-in-time status of what's actually built and verified in this repo. This is a log, not a rulebook — see [AGENTS.md](./AGENTS.md) for the durable conventions every agent must follow regardless of what's implemented yet. Keep this honest: update it as things land, don't let it drift from reality.

## Implemented and verified working

- Monorepo scaffold: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`.
- `packages/db`: Drizzle client + full Better Auth schema (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) generated via `@better-auth/cli generate` from the real auth config, not hand-written. Migrated onto a real Neon Postgres instance (`DATABASE_URL` in `.env.development`).
- `packages/core/src/auth`: Better Auth instance with `emailAndPassword` enabled and the Organization plugin, using `drizzleAdapter(db, { provider: "pg", schema })` pointed at `@repo/db`'s schema.
- `apps/api`: Hono server boots with the security/CORS/body-limit/etag middleware chain, serves `GET /health`, mounts Better Auth's handler at `/api/auth/**`.
- Sign-up and sign-in confirmed working end-to-end against the real DB — `POST /api/auth/sign-up/email` and `POST /api/auth/sign-in/email` both tested with curl, wrote/read a real row in Neon, returned a valid session cookie.
- `apps/api/src/middleware/auth.middleware.ts`: resolves session → B2C vs B2B2C `userContext`, reading the actual member role from `activeOrg.members`.
- `apps/api/src/middleware/permission.middleware.ts`: `requirePermission(permissions)` — PBAC gate for routes. B2B2C calls Better Auth's `auth.api.hasPermission` against the caller's org role; B2C passes through by design.
- `packages/core/src/auth/permissions.ts`: `statement` (resources → actions) is the permission source of truth; `ownerRole`/`adminRole`/`memberRole` are named bundles of it, registered as `{ owner, admin, member }` in the organization plugin config.
- The full B2C and B2B2C auth + permission paths are confirmed working end-to-end against the real DB, not just typechecked: sign-up, sign-in, org creation (creator → `owner` role), server-side `addMember` (→ `member` role), `hasPermission` correctly allowing an owner and a permitted member while blocking one without the right permission, B2C bypass, and an unauthenticated request correctly getting 401. Verified via a throwaway test harness, deleted afterward; all test data cleaned from Neon.
- Response envelope + centralized error handling (`packages/core/src/errors.ts`, `apps/api/src/lib/response.ts`, `app.onError` in `apps/api/src/index.ts`) — verified in both `NODE_ENV=development` (details/stack included) and `NODE_ENV=production` (suppressed) by actually booting and diffing responses, not just reading the code.
- `NODE_ENV`-driven environment detection: `cross-env` in each `apps/api` script sets it per-command (`dev`/`start`/`test`), verified by booting under each mode.

## Bugs found and fixed along the way (worth knowing so they aren't reintroduced)

- Passing a custom `roles` map to Better Auth's `organization` plugin **replaces** its defaults rather than merging — since only `member`/`admin` were defined, every org's auto-assigned `owner` (its creator) had *zero* permissions until `ownerRole` was added explicitly.
- `betterAuth()` had no `trustedOrigins`, so it rejected requests from origins the Hono CORS middleware was already allowing — two separate checks. `trustedOrigins` now reads the same `ALLOWED_ORIGINS` env var as the CORS middleware, so they can't drift apart.
- `NODE_ENV=<mode>` lines inside `.env.*` files were dead weight once `cross-env` was introduced (`cross-env` sets it before `--env-file` would even load, and `--env-file` never overrides an already-set var) — removed, including deleting the then-empty `.env.production`.

## Scaffolded but not wired to anything yet

Do not build on these without checking they still make sense first — see [AGENTS.md](./AGENTS.md)'s "don't scaffold ahead of the task" rule.

- `packages/core/src/algorithms/bkt-scoring.ts` — Bayesian Knowledge Tracing stub, has a unit test, not called from anywhere.
- `packages/core/src/ai/*` — agent types, a Claude client, an `exercise-generator` agent, and a registry. Not called from any route. `ANTHROPIC_API_KEY` is not in `.env.development`. No `/api/ai/run` dispatcher route exists yet.
- `apps/api/src/modules/student-progress/` — directory exists, empty. Would be the first real consumer of `injectUserContext`, `requirePermission`, and the response envelope together.
- "Partner" as a distinct domain entity (separate from Better Auth's generic `organization`) — discussed, not built. Decision: `organization` stays the auth/tenancy primitive; a future `partners` table in `@repo/db` would FK to `organization.id` and hold actual business fields.
- Platform-level admin role (the SaaS owner, distinct from any org's admin) — discussed, not built. Would need Better Auth's `admin` plugin added alongside `organization`.

## Not done

- OpenAPI docs (`@hono/zod-openapi` + `@scalar/hono-api-reference`) discussed, not adopted — no feature route exists yet to establish the convention on.
- Invitation flow (`createInvitation`/`acceptInvitation`) not tested — the permission test added members server-side via `addMember` instead. The invite email/token round-trip itself hasn't been exercised.
