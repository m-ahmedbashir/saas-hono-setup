# AGENTS.md

Instructions for any AI coding agent (Claude Code, Cursor, Codex, etc.) working in this repository. Read this before touching code. If something here conflicts with what you observe in the repo, the repo wins — update this file rather than silently ignoring it.

These are standing rules — they apply to every future file, regardless of what feature is being built. For what's actually implemented and verified right now, see [PROGRESS.md](./PROGRESS.md); don't assume something exists or works just because a rule here describes how it *should* behave.

## What this is

`saas-hono-setup` — a pnpm + Turborepo monorepo. A Hono API (`apps/api`) backed by Postgres via Drizzle (`packages/db`), with auth and domain logic living in an environment-agnostic core package (`packages/core`) so they stay testable without booting a server. Current focus is the generic multi-tenant SaaS foundation (auth, permissions, response contract) — reusable regardless of what product gets built on top of it. Product-specific domain logic (e.g. AI agents, education-specific algorithms) is deliberately deferred; see [PROGRESS.md](./PROGRESS.md).

Full narrative architecture doc (data shaping, prompt caching strategy, auth router design): [architecture-and-agents.md](./architecture-and-agents.md). That file explains *why*. This file governs *how to work here*. [PROGRESS.md](./PROGRESS.md) tracks *what's actually done*.

## Ground rule for agents: don't scaffold ahead of the task

This codebase was previously over-scaffolded in one sitting (algorithms + AI agents got built before the backend and auth even booted). Don't repeat that. Concretely:
- If asked to build feature X, build X and the minimum it needs to run — not X's neighbors "while we're in there."
- Before adding a new module/package, check [PROGRESS.md](./PROGRESS.md)'s "scaffolded but not wired" list — there may already be a stub. Extend it or delete it; don't leave a second parallel one.
- Prefer verifying the thing you just built actually runs (boot the server, hit the endpoint, run the test) over moving on to the next file. Don't rely on typecheck alone — it doesn't catch a route that compiles but was never actually invoked.

## Architecture principles: DDD layering + SOLID

The three packages map onto Domain-Driven Design layers on purpose:

- **Domain** (`packages/core`) — pure business logic (currently: auth/permission primitives; product-specific logic like algorithms or AI agent strategies lands here too, when it exists). No Hono, no HTTP, no network calls.
- **Infrastructure** (`packages/db`, plus the auth wiring in `packages/core/src/auth`) — Drizzle schema/queries, the Postgres connection, Better Auth construction.
- **Application** (`apps/api`) — the delivery layer only: receive a request, validate with Zod, call into Domain/Infrastructure, shape the response. Business logic doesn't belong in a route handler.

Apply SOLID at the file level as you write, not as a retrofit:
- **SRP** — a route file routes, a `.db.ts` file queries, an agent file defines its schema/prompt. If a file's reason-to-change is two different things, split it.
- **OCP** — a new AI agent or a new feature slice should be addable by writing a new file, not editing an unrelated one. (Exception: a registry/barrel needs a one-line addition to register the new file — that's the accepted cost of having a single lookup point, not a violation worth avoiding.)
- **LSP** — don't hard-code assumptions that only hold for one implementation of a contract (e.g. one AI provider, one DB driver) into shared code that's supposed to work for any of them.
- **ISP** — routes expose precise, per-route Zod schemas and RPC types (already how Hono's `AppType` + Zod work here) — never a single monolithic type that forces a client to depend on fields it doesn't use.
- **DIP** — high-level code shouldn't reach directly into a low-level tool's concrete API when it can depend on an interface instead. Known, accepted exception: `packages/core/src/auth/index.ts` imports `db` directly from `@repo/db` for Better Auth's `drizzleAdapter()` — forced by that library's own adapter API, which has no abstraction to invert against. Don't try to "fix" this in isolation, and don't copy the pattern elsewhere without the same justification.

A vendor-coupling gap in the same spirit (e.g. an AI client hard-coding one provider's SDK) is fine to leave alone **only** while nothing calls it yet — designing an abstraction before there's a real caller risks guessing the wrong shape. Fix it when the first real caller shows up, not before.

## Structure

```
apps/api/                  Hono server (deployable)
  src/app.ts                 builds and exports the Hono `app` + AppType — no serve()/side effects, so it's importable from tests
  src/index.ts               process entrypoint only: serve(app) + injectWebSocket(server)
  src/middleware/            cross-cutting Hono middleware
  src/lib/                   HTTP-layer helpers (e.g. response envelope) — not domain logic
  src/modules/<feature>/    one folder per feature slice: *.routes.ts, *.db.ts, *.schema.ts

packages/db/                Drizzle schema + client, owns migrations
  src/schema.ts              table definitions — single source of truth for DB types
  src/index.ts               `db` client export
  drizzle.config.ts

packages/core/              environment-agnostic logic — no Hono/HTTP/socket imports
  src/auth/                  Better Auth config + access control
  src/errors.ts              AppError + error codes — domain-level, not Hono-specific
  src/notifications/types.ts NotificationDispatcher interface + NotificationPayload — contract only, no socket import
```

`apps/api/src/modules/notifications/websocket-dispatcher.ts` is the concrete implementation of that interface — the reference example for the DIP pattern below: the *interface* lives in `packages/core` (pure contract, generic `TClient` so core never needs to know what a "client" concretely is), the *implementation* that actually touches a transport-layer object (a Hono `WSContext` wrapping a raw socket) lives in `apps/api`. Follow this split for any future interface/adapter pair — don't put the concrete, transport-touching class in `packages/core` just because its interface lives there.

Product-specific domain modules (algorithms, AI agent strategies, etc.) aren't scaffolded yet — see [PROGRESS.md](./PROGRESS.md). When one gets built, it's a new subfolder under `packages/core/src/`, following the same "pure logic, no Hono/HTTP/DB-client imports" rule as everything else in this package; don't invent the folder layout speculatively before there's a real module to put in it.

Rules that follow from this layout:
- `packages/core` must never import from `apps/api` or from Hono. It should be usable from a script, a test, or a future non-HTTP entrypoint without modification.
- `packages/db` is the only place table shapes are defined. Don't hand-write TypeScript interfaces that duplicate a Drizzle table or a Zod schema elsewhere — infer with `typeof table.$inferSelect` / `z.infer<typeof schema>`.
- Import Drizzle query operators (`eq`, `and`, etc.) from `@repo/db`'s re-export, not directly from `drizzle-orm` in `apps/api`. A package that depends on `drizzle-orm` directly can silently resolve a *different* pnpm-isolated instance of it than `@repo/db`'s (e.g. when another dependency pulls in `@opentelemetry/api`, which `drizzle-orm` has as an optional peer) — same version number, incompatible types. If `@repo/db` doesn't re-export an operator you need, add it there rather than importing `drizzle-orm` directly elsewhere.
- A new feature slice in `apps/api/src/modules/<feature>/` gets its own `.routes.ts` (Hono router), `.db.ts` (queries, using `@repo/db`), and `.schema.ts` (Zod request/response validation). Don't put query logic directly in a route handler.

## Type safety (non-negotiable, not just a preference)

- Never hand-write an `interface`/`type` that duplicates a Drizzle table or a Zod schema. Derive it: `typeof users.$inferSelect` for DB rows, `z.infer<typeof InputSchema>` for validated input.
- Prefer `satisfies` over a type annotation when defining a config/strategy object against a shared contract type — it keeps literal types intact instead of widening them to the interface.
- If you're about to write a type, first check whether the shape already exists as a table, schema, or inferred type somewhere in `@repo/db` or `@repo/core` — don't redeclare it.

## Data shaping & request validation

- Never return a raw `db.select().from(table)` row through an API response. Select only the fields the response actually needs: `db.select({ name: users.name, email: users.email }).from(users)`. This is as much about not leaking columns you forget exist (password hashes, internal flags) as it is about payload size.
- Every route that accepts a body/query should validate it with a Zod schema from that module's `.schema.ts` before touching the database — don't validate ad hoc inline in the handler.

## Auth model

Better Auth + the Organization plugin is the single identity system for B2C (individual users), B2B (an org/club), and B2B2C (org-sponsored individual). `packages/core/src/auth/index.ts` is the only place `betterAuth(...)` gets constructed.

- To protect a route, apply `injectUserContext` (`apps/api/src/middleware/auth.middleware.ts`) to it and read `c.get('userContext')`. It has a `mode: 'B2C' | 'B2B2C'` discriminant — branch on that, don't assume an organization exists.
- To gate a route by permission rather than by role, use `requirePermission(permissions)` (`apps/api/src/middleware/permission.middleware.ts`), applied after `injectUserContext`. It checks B2B2C members against their org role via Better Auth's `hasPermission`; B2C passes through by design — an individual's access to their own data is an ownership check in that route's `.db.ts` (scope the query to their `userId`), not a permission lookup, since there's no org role to check against.
- Permissions/roles live in `packages/core/src/auth/permissions.ts` via `createAccessControl`. Add new resources/actions there, not as ad-hoc string checks in route handlers. `statement` is the actual source of truth; roles (`ownerRole`/`adminRole`/`memberRole`) are just named bundles of it.
- **Passing a custom `roles` map to the `organization` plugin replaces Better Auth's defaults, it does not merge with them.** Every role that needs plugin-level permissions — including `owner`, which Better Auth auto-assigns to whoever creates an org — must be defined explicitly in that map, or that role silently gets zero permissions.
- `betterAuth()`'s `trustedOrigins` must stay driven by the same `ALLOWED_ORIGINS` env var as the Hono CORS middleware in `apps/api/src/index.ts`. They are two separate checks (Better Auth's own origin validation vs. Hono's CORS) — don't let them drift apart by editing one without the other.
- WebSocket routes are not covered by the CORS middleware — CORS only applies to `fetch`, and a WS handshake still carries cookies cross-site regardless of origin. Any future WS route needs its own explicit `Origin` check against `apps/api/src/lib/allowed-origins.ts`'s `allowedOrigins` (the same list the CORS middleware uses), the way `notifications.routes.ts` does — don't rely on the session cookie's `SameSite` default to prevent cross-site WebSocket hijacking, since that's a client-side behavior this repo may need to relax (`SameSite=None`) once frontend and API are on separate domains.
- Auth routes themselves are unauthenticated by definition — `apps/api/src/modules/auth/auth.routes.ts` just proxies to `auth.handler`. Don't add `injectUserContext` to that router.

### Auth-related tables are generated, never hand-edited

`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` in `packages/db/src/schema.ts` were not written by hand — they came from Better Auth's own CLI, which reads `packages/core/src/auth/index.ts` and emits exactly the tables/columns the enabled plugins require. Whenever a Better Auth plugin is added, removed, or reconfigured, the fix is to regenerate, not guess at the new shape by hand:

```
npx @better-auth/cli@latest generate --config packages/core/src/auth/index.ts --output packages/db/src/auth-schema.generated.ts
```

Then diff the output against `packages/db/src/schema.ts`, merge in whatever changed, delete the temp `auth-schema.generated.ts` file, and run `pnpm db:generate && pnpm db:migrate` to turn the updated schema into a real migration against `DATABASE_URL`. Non-auth tables (e.g. a future `partners` table) don't go through this — only tables backing a Better Auth plugin do.

## Environment & running things

- Package manager is **pnpm** (see `packageManager` in root `package.json`). Don't use npm/yarn.
- **`NODE_ENV` has exactly one source: the `cross-env NODE_ENV=<mode>` prefix in each `apps/api` script** (`dev` → `development`, `start` → `production`, `test` → `test`). It is *not* set inside any `.env.*` file — `cross-env` sets it in the process before a `--env-file` would even load, and `--env-file` never overrides an already-set var, so a duplicate `NODE_ENV=` line inside a `.env.*` file is inert dead weight. Don't add one back.
- `.env.development` / `.env.test` hold the *other* local config (`DATABASE_URL`, `BETTER_AUTH_SECRET`, etc.) — loaded via `tsx`/`node`'s native `--env-file` flag, no `dotenv` dependency. There is deliberately **no `.env.production` file** — production secrets come only from the hosting platform's injected env vars at deploy time, never from a committed file.
- Vitest's own CLI doesn't support `--env-file` (unlike `tsx`/`node`) — that gap is exactly why `cross-env` exists at all rather than relying on `--env-file` for `NODE_ENV` everywhere. Don't assume every script can use `--env-file` uniformly.
- `apps/api/src/lib/response.ts`'s `isDev()` is the single place that reads `NODE_ENV` to decide error verbosity (see "API response shape" below) — don't re-derive "are we in dev" some other way in a route.
- `pnpm dev` (root) runs all apps via Turborepo. `pnpm --filter @repo/api dev` runs just the API.
- `pnpm db:generate` / `pnpm db:migrate` wrap drizzle-kit. `DATABASE_URL` in `.env.development` points at a real Neon Postgres instance — it's live, not a placeholder. Don't run destructive schema changes against it without thinking about it the way you would a real staging DB.

## API response shape

Every response from `apps/api`'s own routes — not `/health` (an infra/ops endpoint) and **not** `/api/auth/**` (Better Auth's own client SDK expects its native shape; wrapping it would break that SDK) — uses one envelope, via `apps/api/src/lib/response.ts`:

- Success: `success(c, data)` → `{ success: true, data }`.
- Failure: never hand-construct an error response. Either call `failure(c, code, message, status, details?)` directly, or — preferred, since it's the same thing but centralized — `throw new AppError(code, message, details?)` from `@repo/core` and let the global `app.onError()` handler in `apps/api/src/app.ts` format it. `AppError`'s `code` is one of the `ErrorCode` union in `packages/core/src/errors.ts` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `INTERNAL_ERROR`) — add a new code there, not a bespoke string, if an existing one doesn't fit.
- `details` on an error is only ever included when `isDev()` is true (`NODE_ENV !== "production"`). Never put anything in `message` that's unsafe to show in production (that's what `details` is for); `message` always ships regardless of environment.
- Unexpected (non-`AppError`) exceptions still get caught by `app.onError` and shaped into the same envelope with `code: "INTERNAL_ERROR"` — a route handler should never need its own try/catch just to keep the response shape consistent.
- That same `INTERNAL_ERROR` branch in `app.onError` also calls `Sentry.captureException(err)` (`apps/api/src/instrument.ts` initializes Sentry, gated behind the optional `SENTRY_DSN` env var — a no-op if unset). Only genuinely unexpected errors get reported this way; `AppError`/`HTTPException` are expected/handled cases and aren't sent to Sentry. Don't scatter `Sentry.captureException` calls elsewhere — this one centralized call is the single reporting point, same principle as the response envelope itself.

## Testing

`apps/api` has two distinct test patterns — use the cheaper one whenever it can actually answer the question, don't default to the heavier one out of habit:

- **Pure unit tests** (e.g. `src/lib/response.test.ts`) — build a small standalone `Hono` instance in the test file itself, drive it with `testClient` from `hono/testing` (`app.fetch` under the hood, no real network socket, no DB). Use this for anything that doesn't need a real session or a real database row — response formatting, pure functions, `AppError` behavior.
- **Integration tests** (e.g. `src/modules/notifications/websocket.integration.test.ts`, named `*.integration.test.ts` to make the distinction greppable) — import the real `app` from `src/app.ts`, boot it with `serve()` on a dedicated port, and exercise it with real HTTP/WebSocket clients against the real database. Required whenever the thing under test is a security boundary or genuinely depends on Better Auth resolving a real session (which needs a real DB round trip) — a mock would just test the mock. Every integration test must clean up what it creates (delete the user/row it made) in `afterAll`, the same discipline as the manual verification scripts used throughout this repo's history.
- Both patterns import the real `app`/route/middleware code, never a re-implementation — a test that duplicates the logic it's supposed to be checking can drift from reality and pass while the real thing is broken.
- `apps/api/vitest.setup.ts` calls `process.loadEnvFile()` against `.env.development` — Vitest's own CLI has no `--env-file` support (same gap that motivated `cross-env` for `NODE_ENV`), so this is how integration tests get `DATABASE_URL` etc.
- If there's no isolated test database configured, integration tests may run against the dev database instead — but they **must** be self-cleaning (delete every row they create, in `afterAll`, unconditionally) since dev data isn't disposable the way a real test DB's would be. Check [PROGRESS.md](./PROGRESS.md) for whether an isolated test database exists yet before assuming either way.

## Conventions

- TypeScript strict mode everywhere (`tsconfig.base.json`), ESM (`"type": "module"` in every package).
- Zod v4 (not v3 — `better-auth`'s peer dependency forced this repo-wide; keep all packages on the same major).
- No comments explaining *what* code does — only *why*, and only when non-obvious (see the caching-order rationale as the model example).

## Keeping the public-facing docs in sync

This repo is published open source (MIT). `README.md` and `CHANGELOG.md` are read by people who aren't in this conversation — unlike `PROGRESS.md` (internal status log) or this file (agent rules), they're the product's own documentation and go stale silently if a change doesn't update them. Concretely, when a change affects any of these, update the doc in the same change, not as a follow-up:

- A new/changed/removed env var, script, or setup step → `README.md`'s relevant section (Environment variables, Getting started, Available scripts).
- A new architectural decision or convention that changes "how to add a feature" → `README.md`'s Architecture / Adding a new feature sections, *and* the relevant rule section in this file.
- Anything a consumer of this repo would notice → a `CHANGELOG.md` entry (see below). Purely internal changes with no observable effect (a variable rename, a comment) don't need one.

### Versioning & changelog mechanism

Categorize every notable change the way [Conventional Commits](https://www.conventionalcommits.org/) does, and use the category to decide both the `CHANGELOG.md` section and the version bump. Current version is pre-1.0 (`0.x.y`), where semver allows more flexibility — this repo's convention while pre-1.0:

| Type | Meaning | CHANGELOG section | Version bump |
|---|---|---|---|
| `feat` | New capability (a route, a middleware, a config option) | `Added` | minor (`0.X.0`) |
| `fix` | Bug fix, behavior now matches what was intended | `Fixed` | patch (`0.x.X`) |
| `breaking` | Changes or removes existing behavior/API a consumer could depend on | `Changed` / `Removed` | minor (`0.X.0`) — once past 1.0.0, this becomes a major bump instead |
| `chore` / `refactor` / `docs` / `test` | No externally observable behavior change | none required | none |

Bump the version in **every workspace `package.json` together** (root, `apps/api`, `packages/core`, `packages/db`) — they move in lockstep in this repo, there's no independent per-package release process (no Changesets or similar; not needed while nothing here is published to npm — add that tooling only if that changes). Add the new version's entry at the top of `CHANGELOG.md`, following the existing `[0.1.0]` entry's format (dated, grouped by `Added`/`Fixed`/`Changed`/etc.).
