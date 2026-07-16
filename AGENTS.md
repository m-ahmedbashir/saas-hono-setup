# AGENTS.md

Instructions for any AI coding agent (Claude Code, Cursor, Codex, etc.) working in this repository. Read this before touching code. If something here conflicts with what you observe in the repo, the repo wins — update this file rather than silently ignoring it.

## What this is

`saas-hono-setup` — a pnpm + Turborepo monorepo. A Hono API (`apps/api`) backed by Postgres via Drizzle (`packages/db`), with auth, domain logic, and AI agents living in an environment-agnostic core package (`packages/core`) so they stay testable without booting a server.

Full narrative architecture doc (data shaping, prompt caching strategy, auth router design): [architecture-and-agents.md](./architecture-and-agents.md). That file explains *why*. This file governs *how to work here*.

## Current state (keep this section honest — update it as things land)

Implemented and verified working:
- Monorepo scaffold: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- `packages/db`: Drizzle client + full Better Auth schema (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) generated via `@better-auth/cli generate` from the real auth config, not hand-written. Migrated onto a real Neon Postgres instance (`DATABASE_URL` in `.env.development`).
- `packages/core/src/auth`: Better Auth instance with `emailAndPassword` enabled and the Organization plugin, using `drizzleAdapter(db, { provider: "pg", schema })` pointed at `@repo/db`'s schema.
- `apps/api`: Hono server boots with the security/CORS/body-limit/etag middleware chain, serves `GET /health`, mounts Better Auth's handler at `/api/auth/**`.
- **Sign-up and sign-in are confirmed working end-to-end against the real DB** — `POST /api/auth/sign-up/email` and `POST /api/auth/sign-in/email` both tested with curl, wrote/read a real row in Neon, returned a valid session cookie. (Test user was deleted after verification.)
- `apps/api/src/middleware/auth.middleware.ts`: resolves session → B2C vs B2B2C `userContext`, reading the actual member role from `activeOrg.members`.
- `apps/api/src/middleware/permission.middleware.ts`: `requirePermission(permissions)` — PBAC gate for routes. B2B2C calls Better Auth's `auth.api.hasPermission` against the caller's org role; B2C passes through by design (an individual's access to their own data is an ownership check in that route's `.db.ts`, not a permission lookup, since there's no org role to check).
- `packages/core/src/auth/permissions.ts`: `statement` (resources → actions) is the actual permission source of truth; `ownerRole`/`adminRole`/`memberRole` are just named bundles of it, registered as `{ owner, admin, member }` in the organization plugin config.
- **The full B2C and B2B2C auth + permission paths are confirmed working end-to-end against the real DB**, not just typechecked: sign-up, sign-in, org creation (creator → `owner` role), server-side `addMember` (→ `member` role), `hasPermission` correctly allowing an owner and a permitted member while blocking a member without the right permission, B2C bypass working, and an unauthenticated request correctly getting 401. Verified via a throwaway test harness that was deleted afterward, and all test users/orgs were cleaned from Neon after.

Two real bugs this uncovered and fixed, worth knowing so they aren't reintroduced:
- Passing a custom `roles` map to Better Auth's `organization` plugin **replaces** its defaults rather than merging — since only `member`/`admin` were defined, every org's auto-assigned `owner` (its creator) had *zero* permissions until `ownerRole` was added explicitly. Any time a new custom role name shows up needing plugin-level permissions, it must be added to this map — Better Auth will not infer it.
- `betterAuth()` had no `trustedOrigins`, so it rejected requests from origins that the Hono CORS middleware was already allowing — these are two separate checks, not one. `trustedOrigins` now reads the same `ALLOWED_ORIGINS` env var as the CORS middleware in `apps/api/src/index.ts`, so they can't drift apart.

Scaffolded but not wired to anything yet (do not build on these without checking they still make sense first):
- `packages/core/src/algorithms/bkt-scoring.ts` — Bayesian Knowledge Tracing stub, has a unit test, not called from anywhere.
- `packages/core/src/ai/*` — agent types, a Claude client, an `exercise-generator` agent, and a registry. Not called from any route. `ANTHROPIC_API_KEY` is not in `.env.development`. No `/api/ai/run` dispatcher route exists yet.
- `apps/api/src/modules/student-progress/` — directory exists, empty. This would be the first real consumer of both `injectUserContext` and `requirePermission`.
- "Partner" as a distinct domain entity (separate from Better Auth's generic `organization`) — discussed, not yet built. Decision: `organization` stays the auth/tenancy primitive; a future `partners` table in `@repo/db` would FK to `organization.id` and hold actual business fields. Not implemented.
- Platform-level admin role (the SaaS owner, distinct from any org's admin) — discussed, not yet built. Would need Better Auth's `admin` plugin added alongside `organization` in `packages/core/src/auth/index.ts`.

Not done: OpenAPI docs (`@hono/zod-openapi` + `@scalar/hono-api-reference`) discussed, not adopted — no feature route exists yet to establish the convention on. Invitation flow (`createInvitation`/`acceptInvitation`) not tested — the permission test added members server-side via `addMember` instead, which is how a real invite-acceptance callback would do it too, but the invite email/token round-trip itself hasn't been exercised.

## Ground rule for agents: don't scaffold ahead of the task

This codebase was previously over-scaffolded in one sitting (algorithms + AI agents got built before the backend and auth even booted). Don't repeat that. Concretely:
- If asked to build feature X, build X and the minimum it needs to run — not X's neighbors "while we're in there."
- Before adding a new module/package, check the "scaffolded but not wired" list above — there may already be a stub. Extend it or delete it; don't leave a second parallel one.
- Prefer verifying the thing you just built actually runs (boot the server, hit the endpoint, run the test) over moving on to the next file.

## Architecture principles: DDD layering + SOLID

This is a standing rule for every future file, not a one-off cleanup. The three packages map onto Domain-Driven Design layers on purpose:

- **Domain** (`packages/core`) — pure business logic: algorithms, AI agent strategies. No Hono, no HTTP, no network calls.
- **Infrastructure** (`packages/db`, plus the auth wiring in `packages/core/src/auth`) — Drizzle schema/queries, the Postgres connection, Better Auth construction.
- **Application** (`apps/api`) — the delivery layer only: receive a request, validate with Zod, call into Domain/Infrastructure, shape the response. Business logic doesn't belong in a route handler.

Apply SOLID at the file level as you write, not as a retrofit:
- **SRP** — a route file routes, a `.db.ts` file queries, an agent file defines its schema/prompt. If a file's reason-to-change is two different things, split it.
- **OCP** — a new AI agent or a new feature slice should be addable by writing a new file, not editing an unrelated one. (Exception: a registry/barrel needs a one-line addition to register the new file — that's the accepted cost of having a single lookup point, not a violation worth avoiding.)
- **LSP** — don't hard-code assumptions that only hold for one implementation of a contract (e.g. one AI provider, one DB driver) into shared code that's supposed to work for any of them.
- **ISP** — routes expose precise, per-route Zod schemas and RPC types (already how Hono's `AppType` + Zod work here) — never a single monolithic type that forces a client to depend on fields it doesn't use.
- **DIP** — high-level code shouldn't reach directly into a low-level tool's concrete API when it can depend on an interface instead. This one has a **known, accepted exception**: `packages/core/src/auth/index.ts` imports `db` directly from `@repo/db` and passes it to Better Auth's `drizzleAdapter()`. That's `@repo/core` depending on a concrete Drizzle client — a real DIP violation — but it's forced by Better Auth's own adapter API, which has no abstraction to invert against. Don't try to "fix" this in isolation; don't copy this pattern elsewhere without the same justification.

Known, currently-accepted gap in the same spirit: `packages/core/src/ai/client.ts` hard-codes the `@anthropic-ai/sdk` import — nothing swaps providers without touching that file. Left as-is deliberately because nothing calls it yet (no agent is wired to a route); revisit when the first agent actually gets dispatched from HTTP, not before — designing the abstraction before there's a real caller risks guessing the wrong shape.

## Structure

```
apps/api/                  Hono server (deployable)
  src/index.ts              entrypoint — route composition, exports AppType for RPC clients
  src/middleware/            cross-cutting Hono middleware
  src/modules/<feature>/    one folder per feature slice: *.routes.ts, *.db.ts, *.schema.ts

packages/db/                Drizzle schema + client, owns migrations
  src/schema.ts              table definitions — single source of truth for DB types
  src/index.ts               `db` client export
  drizzle.config.ts

packages/core/              environment-agnostic logic — no Hono/HTTP/socket imports
  src/auth/                  Better Auth config + access control
  src/algorithms/            pure functions (e.g. BKT scoring), unit-testable in isolation
  src/ai/                    agent types, LLM client, agent registry
```

Rules that follow from this layout:
- `packages/core` must never import from `apps/api` or from Hono. It should be usable from a script, a test, or a future non-HTTP entrypoint without modification.
- `packages/db` is the only place table shapes are defined. Don't hand-write TypeScript interfaces that duplicate a Drizzle table or a Zod schema elsewhere — infer with `typeof table.$inferSelect` / `z.infer<typeof schema>`.
- A new feature slice in `apps/api/src/modules/<feature>/` gets its own `.routes.ts` (Hono router), `.db.ts` (queries, using `@repo/db`), and `.schema.ts` (Zod request/response validation). Don't put query logic directly in a route handler.
- New AI agents go in `packages/core/src/ai/agents/<name>.ts`, satisfying the `AIAgent<TInput, TOutput>` contract in `src/ai/types.ts`, and get registered in `src/ai/registry.ts`. Keep the system prompt's stable content (instructions, schema) before any per-request dynamic content — see the caching discipline in [architecture-and-agents.md](./architecture-and-agents.md#5-prompt-caching-strategy-ai-agent-optimization).

### AI agent dispatch — planned, not built yet

The intended pattern is one generic route (something like `POST /api/ai/run`) that looks an agent up in the registry by id and executes it, rather than a bespoke Hono route per agent. **This dispatcher does not exist in `apps/api` yet** — don't assume it when reading the code, and don't invent a second, competing execution path (e.g. a one-off route that imports an agent directly) if asked to wire an agent up. Build the dispatcher itself first, once there's an actual agent that needs calling from HTTP.

## Type safety (non-negotiable, not just a preference)

- Never hand-write an `interface`/`type` that duplicates a Drizzle table or a Zod schema. Derive it: `typeof users.$inferSelect` for DB rows, `z.infer<typeof InputSchema>` for validated input.
- Prefer `satisfies` over a type annotation when defining a config/strategy object (see `exerciseGenerator` in `src/ai/agents/exercise-generator.ts`) — it keeps literal types intact instead of widening them to the interface.
- If you're about to write a type, first check whether the shape already exists as a table, schema, or inferred type somewhere in `@repo/db` or `@repo/core` — don't redeclare it.

## Data shaping & request validation

- Never return a raw `db.select().from(table)` row through an API response. Select only the fields the response actually needs: `db.select({ name: users.name, email: users.email }).from(users)`. This is as much about not leaking columns you forget exist (password hashes, internal flags) as it is about payload size.
- Every route that accepts a body/query should validate it with a Zod schema from that module's `.schema.ts` before touching the database — don't validate ad hoc inline in the handler.

## Auth model

Better Auth + the Organization plugin is the single identity system for B2C (individual users), B2B (an org/club), and B2B2C (org-sponsored individual). `packages/core/src/auth/index.ts` is the only place `betterAuth(...)` gets constructed.

- To protect a route, apply `injectUserContext` (`apps/api/src/middleware/auth.middleware.ts`) to it and read `c.get('userContext')`. It has a `mode: 'B2C' | 'B2B2C'` discriminant — branch on that, don't assume an organization exists.
- Permissions/roles live in `packages/core/src/auth/permissions.ts` via `createAccessControl`. Add new resources/actions there, not as ad-hoc string checks in route handlers.
- Auth routes themselves are unauthenticated by definition — `apps/api/src/modules/auth/auth.routes.ts` just proxies to `auth.handler`. Don't add `injectUserContext` to that router.

### Auth-related tables are generated, never hand-edited

`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` in `packages/db/src/schema.ts` were not written by hand — they came from Better Auth's own CLI, which reads `packages/core/src/auth/index.ts` and emits exactly the tables/columns the enabled plugins require. Whenever a Better Auth plugin is added, removed, or reconfigured (e.g. adding the `admin` plugin for the platform-owner role), the fix is to regenerate, not guess at the new shape by hand:

```
npx @better-auth/cli@latest generate --config packages/core/src/auth/index.ts --output packages/db/src/auth-schema.generated.ts
```

Then diff the output against `packages/db/src/schema.ts`, merge in whatever changed, delete the temp `auth-schema.generated.ts` file, and run `pnpm db:generate && pnpm db:migrate` to turn the updated schema into a real migration against `DATABASE_URL`. Non-auth tables (e.g. a future `partners` table) don't go through this — only tables backing a Better Auth plugin do.

## Environment & running things

- Package manager is **pnpm** (see `packageManager` in root `package.json`). Don't use npm/yarn.
- **`NODE_ENV` has exactly one source: the `cross-env NODE_ENV=<mode>` prefix in each `apps/api` script** (`dev` → `development`, `start` → `production`, `test` → `test`). It is *not* set inside any `.env.*` file — `cross-env` sets it in the process before the file would even load, and `--env-file` never overrides an already-set var, so a duplicate `NODE_ENV=` line inside a `.env.*` file would be inert dead weight. Don't add one back.
- `.env.development` / `.env.test` hold the *other* local config (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) — loaded via `tsx`/`node`'s native `--env-file` flag, no `dotenv` dependency. There is deliberately **no `.env.production` file** — production secrets come only from the hosting platform's injected env vars at deploy time, never from a committed file, so there's nothing for `apps/api`'s `start` script to load beyond what `cross-env` already sets.
- `test` uses `cross-env` alone, no `--env-file` — Vitest's own CLI doesn't support that flag (unlike `tsx`/`node`), which is exactly the gap that made `cross-env` necessary in the first place rather than relying on `--env-file` for `NODE_ENV` everywhere.
- `apps/api/src/lib/response.ts`'s `isDev()` is the single place that reads `NODE_ENV` to decide error verbosity (see "API response shape" below) — don't re-derive "are we in dev" some other way in a route.
- `pnpm dev` (root) runs all apps via Turborepo. `pnpm --filter @repo/api dev` runs just the API.
- `pnpm db:generate` / `pnpm db:migrate` wrap drizzle-kit. `DATABASE_URL` in `.env.development` points at a real Neon Postgres instance — it's live, not a placeholder. Don't run destructive schema changes against it without thinking about it the way you would a real staging DB.
- Before claiming a change works: boot the affected app and hit the route (curl/health check), don't rely on typecheck alone. This repo has already had one instance of code that compiled but was never actually run.

## API response shape

Every response from `apps/api`'s own routes — not `/health` (an infra/ops endpoint) and **not** `/api/auth/**` (Better Auth's own client SDK expects its native shape; wrapping it would break that SDK) — uses one envelope, via `apps/api/src/lib/response.ts`:

- Success: `success(c, data)` → `{ success: true, data }`.
- Failure: never hand-construct an error response. Either call `failure(c, code, message, status, details?)` directly, or — preferred, since it's the same thing but centralized — `throw new AppError(code, message, details?)` from `@repo/core` and let the global `app.onError()` handler in `apps/api/src/index.ts` format it. `AppError`'s `code` is one of the `ErrorCode` union in `packages/core/src/errors.ts` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`) — add a new code there, not a bespoke string, if an existing one doesn't fit.
- `details` on an error is only ever included when `isDev()` is true (`NODE_ENV !== "production"`) — confirmed by booting the same code under both `NODE_ENV=development` and `NODE_ENV=production` and diffing the actual response bodies, not just reading the code. Never put anything in `message` that's unsafe to show in production (that's what `details` is for); `message` always ships regardless of environment.
- Unexpected (non-`AppError`) exceptions still get caught by `app.onError` and shaped into the same envelope with `code: "INTERNAL_ERROR"` — a route handler should never need its own try/catch just to keep the response shape consistent.

## Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`), ESM (`"type": "module"` in every package).
- Zod v4 (not v3 — `better-auth`'s peer dependency forced this repo-wide; keep all packages on the same major).
- No comments explaining *what* code does — only *why*, and only when non-obvious (see the caching-order rationale as the model example).
