# saas-hono-setup

A production-oriented starting point for a multi-tenant SaaS backend: [Hono](https://hono.dev) on the API layer, [Drizzle ORM](https://orm.drizzle.team) on Postgres, and [Better Auth](https://better-auth.com) handling authentication and organizations — wired together in a type-safe pnpm/Turborepo monorepo.

It is deliberately **product-agnostic**. There's no example CRUD feature baked in on top of the auth layer — this repo is the reusable foundation (auth, permissions, a consistent API response contract, environment handling) you'd fork or build on for an actual product, not a finished app.

## Why this exists

Most starter templates either skip auth entirely or bolt on something minimal. This one takes the opposite approach: the auth/permission layer is built out properly first — real multi-tenancy (individual users *and* organizations), permission-based access control (not just role checks), a consistent error/response shape, and environment-aware error verbosity — so that whatever you build on top of it doesn't have to relitigate those decisions.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Strict dependency isolation (no phantom deps), cached task pipelines |
| API | [Hono](https://hono.dev) on Node (`@hono/node-server`) | Fast, web-standard, tiny — and its Zod + RPC integration gives end-to-end type safety to clients for free |
| Database | Postgres via [Drizzle ORM](https://orm.drizzle.team) | Schema-as-code, SQL-level migrations, no hidden magic |
| Auth | [Better Auth](https://better-auth.com) | Email/password + an Organization plugin for multi-tenancy (individual, org member, org owner) out of the box |
| Validation | [Zod](https://zod.dev) v4 | Single source of truth for request/response shapes |
| Language | TypeScript, strict mode everywhere | |

## Prerequisites

- Node.js ≥ 22
- pnpm (see `packageManager` in `package.json` for the exact version)
- A Postgres database — [Neon](https://neon.tech) has a free tier and works well for local development; any Postgres works

## Getting started

```bash
git clone <this-repo>
cd saas-hono-setup
pnpm install

cp .env.example .env.development
# edit .env.development: set DATABASE_URL to your Postgres instance,
# generate BETTER_AUTH_SECRET with `npx auth secret`

pnpm db:generate   # generate SQL migrations from packages/db/src/schema.ts
pnpm db:migrate    # apply them to your database

pnpm dev           # boots apps/api on http://localhost:8787
```

Confirm it's up:

```bash
curl http://localhost:8787/health
# {"status":"ok"}
```

Try a real sign-up against your database:

```bash
curl -X POST http://localhost:8787/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"email":"you@example.com","password":"password1234","name":"Your Name"}'
```

## Environment variables

See `.env.example` for the full list with comments. Summary:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `BETTER_AUTH_SECRET` | Session/token signing secret — generate with `npx auth secret` |
| `BETTER_AUTH_URL` | Base URL this API is served from |
| `PORT` | Port `apps/api` listens on |
| `ALLOWED_ORIGINS` | Comma-separated origins allowed to call this API — drives both the Hono CORS middleware and Better Auth's own origin check |

`.env.development` / `.env.test` are gitignored — they're for your local machine only. `NODE_ENV` itself is **not** set in any env file; each `apps/api` script sets it directly (`dev` → `development`, `start` → `production`, `test` → `test`) via `cross-env`, so it's always correct regardless of which command runs. Real production secrets should come from your hosting platform's env var injection at deploy time, never from a committed file.

## Project structure

```
apps/api/                  Hono server — the only deployable app right now
  src/index.ts              entrypoint: middleware chain, route composition, exports AppType for RPC clients
  src/middleware/            injectUserContext (auth), requirePermission (PBAC)
  src/lib/                   response.ts — the API's success/error envelope
  src/modules/auth/          proxies to Better Auth's own handler

packages/db/                Drizzle schema + client, owns migrations
  src/schema.ts              table definitions (auth tables are generated, see below)
  drizzle.config.ts

packages/core/              environment-agnostic domain logic — no Hono, no HTTP
  src/auth/                  Better Auth config + access control (permissions)
  src/errors.ts              AppError + error codes, shared by the whole API
```

## Architecture

The three packages are a light Domain-Driven Design split:

- **`packages/core`** (Domain) — pure logic: auth configuration, permission definitions, error types. Never imports Hono, never makes a network call. Usable from a script or a test without booting a server.
- **`packages/db`** (Infrastructure) — Drizzle schema and the Postgres client. Owns migrations.
- **`apps/api`** (Application) — the delivery layer. Validates requests, calls into Domain/Infrastructure, shapes the response. No business logic lives in a route handler.

### Auth & multi-tenancy

Better Auth's Organization plugin gives three identity shapes for free:

- **B2C** — an individual user, no organization.
- **B2B2C member** — a user invited into an organization with a role (`member`, `admin`).
- **Organization owner** — whoever created the org, auto-assigned the `owner` role.

`injectUserContext` (a Hono middleware) resolves which of these a request is coming from and exposes it as `c.get('userContext')`. `requirePermission(permissions)` gates a route by *permission*, not role: for an org member it checks their role's actual permissions via Better Auth; for a B2C individual it passes through, since an individual's access to their own data is an ownership check at the query level, not a role lookup.

Permissions are resource/action pairs defined once in `packages/core/src/auth/permissions.ts` — roles are just named bundles of them, never checked by name in route code.

### API response contract

Every route in `apps/api` (except `/health` and the `/api/auth/**` proxy, which needs to stay in Better Auth's own shape for its client SDK) returns one of:

```ts
{ success: true, data: T }
{ success: false, error: { code: string, message: string, details?: unknown } }
```

`details` only appears outside production (`NODE_ENV !== "production"`) — stack traces and debug info never ship to real users. Throw an `AppError(code, message, details?)` from anywhere and a global handler formats it consistently; no route needs its own try/catch.

## Available scripts

Run from the repo root (fans out via Turborepo) or scoped with `--filter @repo/api`:

| Script | What it does |
|---|---|
| `pnpm dev` | Start `apps/api` in watch mode |
| `pnpm build` | Compile all packages |
| `pnpm test` | Run tests |
| `pnpm typecheck` | `tsc --noEmit` across the monorepo |
| `pnpm db:generate` | Generate a SQL migration from `packages/db/src/schema.ts` |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL` |

## Adding a new feature

There's no example to copy yet, but the convention is fixed. A new feature (say, `widgets`) gets its own slice under `apps/api/src/modules/widgets/`:

1. **`widgets.schema.ts`** — Zod schemas for the request/response shapes. This is the single source of truth for that feature's types (`z.infer<typeof Schema>`, never a hand-written `interface`).
2. **`widgets.db.ts`** — query functions using `db` from `@repo/db`. Always select explicit fields (`db.select({ id: widgets.id, name: widgets.name })`), never a raw full-row `select()` — don't leak columns the response doesn't need.
3. **`widgets.routes.ts`** — a Hono router. Validate input against the Zod schema, call the `.db.ts` functions, return via `success()`/`failure()` from `apps/api/src/lib/response.ts`. Apply `injectUserContext` (and `requirePermission(...)` if it needs permission gating) here, not inside the query functions.
4. Mount it in `apps/api/src/index.ts`.

If a new table is involved, add it to `packages/db/src/schema.ts`, then `pnpm db:generate && pnpm db:migrate`. (Exception: if you're extending an auth-related table like `user`, don't hand-edit the schema — see `AGENTS.md`'s note on regenerating Better Auth's schema via its CLI.)

## Contributing

[`AGENTS.md`](./AGENTS.md) is the full set of engineering conventions for this repo — architecture rules, the DDD/SOLID reasoning behind the package split, the auth model in detail, and the response contract. It was written for AI coding agents working in this repo, but every rule in it applies equally to a human contributor. Read it before opening a PR. [`PROGRESS.md`](./PROGRESS.md) tracks what's actually implemented and verified at any given time, separate from the standing rules.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

MIT — see [LICENSE](./LICENSE).
