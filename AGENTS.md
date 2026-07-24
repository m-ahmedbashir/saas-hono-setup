# AGENTS.md

Instructions for any AI coding agent working in this repository. Read before touching code. If this conflicts with what you observe in the repo, the repo wins — update this file, don't silently ignore it.

Standing rules — apply to every future file. For what's actually built and verified right now, see [PROGRESS.md](./PROGRESS.md); don't assume something exists just because a rule here describes how it _should_ behave.

## What this is

`saas-hono-setup` — pnpm + Turborepo monorepo. Hono API (`apps/api`) + Postgres/Drizzle (`packages/db`) + environment-agnostic domain logic (`packages/core`, testable without a server). Current focus: a generic multi-tenant SaaS foundation (auth, permissions, response contract, billing) reusable regardless of product. Product-specific logic (AI agents, algorithms) is deliberately deferred — see PROGRESS.md.

[architecture-and-agents.md](./architecture-and-agents.md) explains _why_ (data shaping, auth router design). This file governs _how to work here_. PROGRESS.md tracks _what's done_.

## Ground rule: don't scaffold ahead of the task

This repo was previously over-scaffolded in one sitting (algorithms + AI agents built before auth even booted). Don't repeat that:

- Build the feature asked for and the minimum it needs to run — not its neighbors "while we're in there."
- Check PROGRESS.md's "scaffolded but not wired" list before adding a new module — extend or delete an existing stub, don't leave a second parallel one.
- Verify what you built actually runs (boot the server, hit the endpoint, run the test) before moving on — typecheck alone doesn't catch a route that compiles but is never invoked.

## Architecture: DDD layering + SOLID

- **Domain** (`packages/core`) — pure business logic. No Hono, no HTTP, no network calls.
- **Infrastructure** (`packages/db`, `packages/core/src/auth`) — Drizzle schema/queries, Postgres connection, Better Auth construction.
- **Application** (`apps/api`) — delivery layer only: receive request, validate, call Domain/Infrastructure, shape response. No business logic in a route handler.

SOLID at the file level, as you write, not as a retrofit:

- **SRP** — a route file routes, a `.db.ts` file queries. Two reasons-to-change means split the file.
- **OCP** — a new feature slice is a new file, not an edit to an unrelated one (a registry/barrel needing a one-line addition to register it is the accepted exception).
- **LSP** — don't bake single-implementation assumptions (one DB driver, one vendor) into code meant to work for any implementation of a contract.
- **ISP** — routes expose precise, per-route Zod schemas/RPC types, never one monolithic type forcing a client to depend on unused fields.
- **DIP** — high-level code depends on an interface, not a low-level tool's concrete API directly. Accepted exception: `packages/core/src/auth/index.ts` imports `db` from `@repo/db` for Better Auth's `drizzleAdapter()` — that library's adapter API has no abstraction to invert against. Don't copy this pattern elsewhere without the same justification. A vendor-coupling gap (e.g. hard-coding one AI provider's SDK) is fine to leave alone _only_ while nothing calls it yet — fix it when the first real caller shows up, not before.

## Structure

```
apps/api/                  Hono server (deployable)
  src/app.ts                 builds/exports the Hono `app` + AppType — no serve()/side effects, importable from tests
  src/index.ts               process entrypoint only: serve(app) + injectWebSocket(server)
  src/middleware/            cross-cutting Hono middleware
  src/lib/                   HTTP-layer helpers (e.g. response envelope) — not domain logic
  src/modules/<feature>/    one folder per feature slice: *.routes.ts, *.controller.ts, *.db.ts, *.schema.ts, *.service.ts/*.handlers.ts as needed

packages/db/                Drizzle schema + client, owns migrations
  src/schema.ts              table definitions — single source of truth for DB types
  src/index.ts               `db` client export + re-exported drizzle-orm operators
  drizzle.config.ts

packages/core/              environment-agnostic logic — no Hono/HTTP/socket imports
  src/auth/                  Better Auth config + access control
  src/errors.ts              AppError + error codes
  src/notifications/types.ts NotificationDispatcher interface — contract only
  src/billing/types.ts       BillingGateway interface — contract only
```

Interface/adapter split: the _interface_ lives in `packages/core` (pure contract — e.g. `NotificationDispatcher<TClient>`, generic so core never knows what a "client" concretely is); the _implementation_ that touches a real transport/vendor object lives in `apps/api` (e.g. `websocket-dispatcher.ts`, `stripe-billing.service.ts`). Follow this for any future interface/adapter pair.

Product-specific domain modules (algorithms, AI strategies) aren't scaffolded yet — when built, a new subfolder under `packages/core/src/`, same "pure logic" rule as everything else there. Don't invent the layout before there's a real module.

Rules from this layout:

- `packages/core` never imports from `apps/api` or Hono — must stay usable from a script, a test, or a future non-HTTP entrypoint.
- `packages/db` is the only place table shapes are defined. Derive types (`typeof table.$inferSelect`), never hand-write a duplicate interface.
- Import Drizzle operators (`eq`, `count`, etc.) from `@repo/db`'s re-export, not `drizzle-orm` directly in `apps/api` — a direct dependency there can resolve a _different_ pnpm-isolated `drizzle-orm` instance (e.g. once another dependency pulls in `@opentelemetry/api`, an optional peer) with incompatible types despite matching versions. Add missing operators to `@repo/db`'s re-export instead.
- A feature slice gets `.routes.ts` (router), `.controller.ts` (named HTTP handler functions), `.db.ts` (queries), `.schema.ts` (Zod). Don't put query logic in a route handler.
- **No handler function body ever lives in `.routes.ts` — hard rule, no "it's just one call" exception.** `.routes.ts` is a manifest: for each route, the path, its middleware/validators (inline is fine — see below), and a **named reference** to a handler function, never a function literal. The handler itself — even a trivial one-call-and-respond handler — lives in `<feature>.controller.ts`, one exported function per route. Multi-step business logic (a `switch` deciding what an input means, several calls in order) still doesn't belong in the controller function either — pull that into `<feature>.service.ts` (called directly) or `<feature>.handlers.ts` (reacting to an event/webhook, e.g. `billing.handlers.ts`'s webhook processing); the controller function calls it and shapes the response. Reference: `apps/api/src/modules/billing/` (`billing.routes.ts` + `billing.controller.ts` + `stripe-billing.service.ts` + `billing.handlers.ts`).
  - Middleware/validators stay inline in `.routes.ts` (`injectUserContext`, `requirePermission(...)`, a `zValidator` bound to one route's schema) — only the terminal handler moves out. Extract middleware to a named file in `apps/api/src/middleware/` only when it's reused across routes.
  - **A controller handler that reads `c.req.valid(target)` needs an explicit `Context` type reconstructing `@hono/zod-validator`'s output shape** (`Context<any, string, { in: { json: z.input<Schema> }; out: { json: z.output<Schema> } }>`) — pulling the handler out of the same `.post(path, validator, handler)` chain it's validated in loses TypeScript's contextual inference for `.valid()`; a plain `Context` types it as unusable (`never`). `billing.controller.ts`'s `ValidatedJsonContext<Schema>` is the reference pattern — reuse it, don't re-derive it per feature.
  - One exception to "one call" inside a controller function: narrowing a discriminated union (e.g. `UserContext`'s `B2C | B2B2C`) doesn't survive a middleware→handler boundary in Hono's type system, so a handler needing `organizationId` legitimately needs one narrowing call (`requireOrgContext`, `apps/api/src/middleware/auth.middleware.ts`) before its one real call. That's narrowing glue, not business logic.
  - **`app.ts` follows the same rule** — it's not a feature slice, so its root-level hooks (`.get("/health", ...)`, `app.notFound(...)`, `app.onError(...)`) are named functions in `apps/api/src/lib/app-handlers.ts`, not inline, same as any other handler. `onError` especially: it branches on error type (`AppError` / `HTTPException` / unknown), which is exactly the "multi-step logic doesn't live where it's registered" case this rule exists for.

## Type safety (non-negotiable)

- Never hand-write a type duplicating a Drizzle table or Zod schema — derive it (`typeof x.$inferSelect`, `z.infer<typeof Schema>`).
- Prefer `satisfies` over a type annotation for config/strategy objects — keeps literal types intact.
- Check `@repo/db`/`@repo/core` for an existing shape before declaring a new type.

## Data shaping & request validation

- Never return a raw `db.select().from(table)` row — select only needed fields (avoids leaking columns like password hashes and reduces payload size).
- Every route with a body/query validates via `@hono/zod-validator`'s `zValidator(target, schema, hook)` as route middleware — a real pre-route guard, not `.safeParse()` inside the handler. Handler reads `c.req.valid(...)`, never `c.req.json()` directly. The `hook` is required: without it, a failure returns the library's own shape, not this app's `{ success, error }` envelope — the hook must re-throw `AppError("VALIDATION_ERROR", message, details)`. For Zod v4, build `details` with `flattenError(result.error)` from `"zod"` — the hook's `result.error` is zod's core `$ZodError`, which has no `.flatten()` method the way a plain `.safeParse()` result's classic `ZodError` does. Reference: `billing.routes.ts`'s `validateCheckoutBody`.

## Auth model

Better Auth + Organization plugin is the single identity system for B2C (individual), B2B (org), B2B2C (org-sponsored individual). `packages/core/src/auth/index.ts` is the only place `betterAuth(...)` is constructed.

- Protect a route with `injectUserContext` (`middleware/auth.middleware.ts`), read `c.get('userContext')` — branch on its `mode: 'B2C' | 'B2B2C'` discriminant, don't assume an org exists.
- Gate by permission with `requirePermission(permissions)` (`middleware/permission.middleware.ts`), after `injectUserContext`. Checks B2B2C members via Better Auth's `hasPermission`; B2C passes through by design (an individual's access to their own data is an ownership check in `.db.ts`, not a permission lookup).
- Permissions/roles live in `packages/core/src/auth/permissions.ts` via `createAccessControl`. `statement` is the source of truth; `ownerRole`/`adminRole`/`memberRole` are named bundles of it.
- **A custom `roles` map on the `organization` plugin replaces Better Auth's defaults, doesn't merge.** Every role needing plugin permissions — including auto-assigned `owner` — must be defined explicitly or it silently gets zero permissions.
- `betterAuth()`'s `trustedOrigins` must read the same `ALLOWED_ORIGINS` as the Hono CORS middleware — two separate checks, don't let them drift.
- CORS doesn't cover WebSocket handshakes (only `fetch`) — a WS route needs its own explicit `Origin` check against `lib/allowed-origins.ts` (see `notifications.routes.ts`). Don't rely on the session cookie's `SameSite` default to prevent cross-site WS hijacking — that's a client-side behavior this repo may need to relax once frontend/API are on separate domains.
- Auth routes (`modules/auth/auth.routes.ts`) are unauthenticated by definition, just proxy to `auth.handler` — don't add `injectUserContext` there.

### Auth-related tables are generated, never hand-edited

`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` in `packages/db/src/schema.ts` came from Better Auth's CLI, not hand-written. When a plugin is added/removed/reconfigured, regenerate — don't guess the new shape:

```
npx @better-auth/cli@latest generate --config packages/core/src/auth/index.ts --output packages/db/src/auth-schema.generated.ts
```

Diff against `schema.ts`, merge changes, delete the temp file, run `pnpm db:generate && pnpm db:migrate`. Non-auth tables (e.g. `billing`) don't go through this.

## Billing model

`BillingGateway` (`packages/core/src/billing/types.ts`) — vendor-agnostic contract (`createCheckoutSession`, `createIndividualCheckoutSession`, `updateSubscriptionQuantity`, `cancelSubscription`, `parseWebhookEvent`). `StripeBillingService` (`apps/api/src/modules/billing/stripe-billing.service.ts`) is the concrete adapter.

- **No file outside `stripe-billing.service.ts` may import `stripe`** — including its types. The webhook route only ever sees the normalized `BillingEvent` union from `parseWebhookEvent`, never Stripe's raw event shape — this is what makes swapping vendors a one-file change.
- **Organization and individual billing are two separate tables and two separate flows — not one polymorphic model.** `organization_billing` (FK'd to `organization.id`) is seat-based (`organizationPlans`, `OrganizationPlanId`). `individual_billing` (FK'd to `user.id`) has no seat/quantity concept at all (`individualPlans`, `IndividualPlanId` — a genuinely different, smaller shape, not `OrganizationPlanConfig` with a meaningless `seatLimit`). Neither is columns added to its generated/owning table (`organization`/`user` are both Better-Auth-generated and would drift on regeneration) — same "own table" reasoning as the auth tables section below. Reference files: `organization-billing.db.ts` / `individual-billing.db.ts`, `billing.routes.ts`'s two checkout routes.
- `POST /billing/organization-checkout` requires `requirePermission({ billing: ["manage"] })` + `requireOrgContext` — owner/admin only, for the org's active org. `POST /billing/individual-checkout` requires only `injectUserContext`, scoped to `userContext.user.id` — an ownership check, not a permission one (same reasoning as B2C data access elsewhere: there's no org role to check against). Works identically for a B2C or B2B2C session, since every session has a user.
- `POST /billing/webhook` is unauthenticated (Stripe calls it directly), verified by signature via `parseWebhookEvent` instead, and its response isn't wrapped in the envelope (Stripe only checks HTTP status). `BillingEvent`'s `checkout_completed` variant is a discriminated union on `ownerType: "organization" | "individual"` — `billing.handlers.ts` branches on it to decide which table to write to. `subscription_updated`/`subscription_canceled` events don't carry an owner id at all (only a Stripe subscription id), so the handler updates _both_ tables unconditionally by `providerSubscriptionId` — safe because Stripe subscription ids are unique per subscription and each checkout writes to exactly one table, so the non-matching table's update is always a harmless no-op. Don't "optimize" this into a single lookup-then-update without re-verifying that reasoning.
- `enforceSeatLimit` (`middleware/seat-limit.middleware.ts`) throws `PAYMENT_REQUIRED` once active member count reaches the org plan's `seatLimit`; B2C passes through. Individual billing has no seat concept, so this middleware only ever applies to the organization side.

## Feature Entitlements

In-house, zero-dependency plan-based feature gating — see `ENTITLEMENTS.md` for the full design rationale (why not a third-party service, why each deviation from the obvious naive design). Compressed rules:

- `packages/core/src/billing/entitlements.ts` — `PlanEntitlements` (boolean `features` + numeric `limits`), two separate maps `organizationPlanEntitlements`/`individualPlanEntitlements` keyed by `OrganizationPlanId`/`IndividualPlanId` (not a field on `OrganizationPlanConfig`/`IndividualPlanConfig` — different concern, different reason to change), and `BillingOwner` (a `{ ownerType, planId }` discriminated union, same shape as `BillingEvent`'s discriminant). `canAccessFeature(owner, feature)`/`getPlanLimit(owner, limit)` are pure — no DB/HTTP.
- `apps/api/src/middleware/entitlement.middleware.ts` — one middleware, `requireFeature(feature, scope)`, for the whole app (both billing universes), after `injectUserContext`. **`scope: "organization" | "individual"` is a required argument, never inferred from `userContext.mode`** — a B2B2C session having an active org doesn't mean every route it hits is an org-level feature; inferring scope from session state would silently check the wrong plan's entitlements for a personal-feature route. The route author declares which billing entity gates it.
- Denial throws the existing `PAYMENT_REQUIRED` code (same as `enforceSeatLimit`'s plan-limit case) — don't add a new `ErrorCode` for this. `scope: "organization"` with no active org throws `requireOrgContext`'s `VALIDATION_ERROR` instead — a different problem ("no org") than "plan too low," kept as a different code on purpose.
- Resolves the current plan via the same RLS-respecting helpers as everything else touching billing tables (`withOrgScope`/`getBillingByOrgId`, `withUserScope`/`getUserBillingByUserId`), defaulting to `"free"`/`"individual_free"` when no billing row exists yet — never the bare `db` client.
- No route in this repo uses `requireFeature` yet — don't invent a placeholder feature module (`ai.routes.ts`, `student-progress.routes.ts`) just to wire it in; that's exactly the ahead-of-task scaffolding this repo's ground rule warns against. `entitlement.integration.test.ts` proves the middleware against a test-only route on a standalone `Hono` instance instead.

## User Profile

`profile` (`packages/db/src/schema.ts`) — phone, `dateOfBirth`, structured address (`addressStreet`/`addressCity`/`addressState`/`addressPostalCode`/`addressCountry`). One row per user, FK'd to `user.id`, lazily created on first `PATCH` (not at signup) — same "own table, not columns on the generated table" reasoning as `organizationBilling`/`individualBilling`, and the same ownership model as individual billing: works identically for B2C and B2B2C, no org concept at all.

- **`dateOfBirth`, not a raw `age`** — an age goes stale the moment a year passes; `dateOfBirth` is the actual source of truth, `profile.schema.ts` also bounds it (not in the future, not >130 years ago).
- **Address is structured, not one free-text column** — usable for shipping/tax/filtering later. `addressCountry` is validated as an ISO 3166-1 alpha-2 code, not a free-text country name, at the app boundary (`packages/db` can't import Zod).
- `GET`/`PATCH /profile` — `injectUserContext` only, no `requirePermission`/`requireOrgContext`, same reasoning as `/billing/individual-checkout`.
- `PATCH`'s Zod schema makes every field `.optional()`, distinct from `.nullable()`: an **omitted** field means "leave unchanged," an explicit **`null`** means "clear it" — `profile.service.ts`'s `updateProfile` only spreads a DB column into the update payload when the corresponding input field is `!== undefined`. Don't collapse that distinction (e.g. by defaulting missing fields to `null`) without checking every caller still means what it says.
- RLS-enabled (`withUserScope`, same as `individual_billing`) — profile data is at least as sensitive as billing plan info.

## Account deletion

`DELETE /account` (`apps/api/src/modules/account/`) — permanently deletes the authenticated user's own account and everything that belongs to it. `injectUserContext` only, no `requirePermission`/`requireOrgContext`, same ownership reasoning as `/profile`.

- **Blocks if the user is the sole `"owner"` of an org that still has other members** — throws `VALIDATION_ERROR` (422) telling them to transfer ownership or remove other members first, rather than silently orphaning the org. If they're the sole owner _and_ the only member, that org has nothing to hand off — it's deleted along with the account instead of left permanently orphaned.
- **Cancels any live Stripe subscription first (best-effort)** — both the account's own `individual_billing` subscription and any solo-owned org's `organization_billing` subscription, via `billingService.cancelSubscription` (implemented earlier, this is its first real caller). Swallows a Stripe failure (API down, no `STRIPE_SECRET_KEY` configured) rather than blocking deletion on it — a stray still-active subscription is a billing-ops follow-up, not a reason to refuse someone's own data-deletion request.
- **Explicitly deletes RLS-protected rows (`profile`, `individual_billing`, `organization_billing`) itself, through the normal `withUserScope`/`withOrgScope` helpers — never relies on `ON DELETE CASCADE` for them.** Postgres applies `FORCE ROW LEVEL SECURITY` policies to rows touched by a cascade action too, not just direct statements — deleting `user`/`organization` and trusting the FK cascade to clean up those specific child tables would run the cascade's implicit delete unscoped (no `app.current_user_id`/`current_org_id` set), which the fail-closed policy blocks, turning what should be a clean delete into a foreign-key-violation error. Non-RLS tables (`session`, `account`, `member`, `invitation`, `organization` itself) are left to cascade normally — nothing RLS-related to fight there. `account.db.ts`'s ordering comments are the reference for why each delete happens where it does.
- `account.db.ts` introduces `AnyExecutor` (`packages/db/src/index.ts`) — `typeof db | DbExecutor` — for the handful of functions here that query non-RLS tables (`member`, `organization`, `user`) where scoping doesn't matter either way. RLS-enabled tables should keep requiring the stricter `DbExecutor`, not `AnyExecutor`, so a caller can't accidentally query them unscoped.

## Row-Level Security

Defense-in-depth on top of app-level scoping, not a replacement for it — every route still has its own auth/permission checks. Applies to tables _we_ own and control every query for (currently `organization_billing`, `individual_billing`, and `profile`). Deliberately not applied to Better-Auth-generated tables (`user`, `session`, `member`, etc.) — Better Auth queries those internally via `drizzleAdapter`, and we don't control every query shape it issues; RLS there risks breaking login/session resolution on a library version bump for no real security gain (Better Auth's own session validation is already that trust boundary).

- **The app connects to Postgres as two different roles.** `DATABASE_URL` (owner role) is used only for migrations. `APP_DATABASE_URL` (a restricted `app_user` role, no `BYPASSRLS`) is what `packages/db/src/index.ts`'s `db` client actually uses at runtime — `packages/db/src/index.ts` throws at import time if `APP_DATABASE_URL` is unset, on purpose, rather than silently falling back to the owner role. **This split exists because Neon's default owner role has `BYPASSRLS` granted directly on the role** (not just table-owner exemption, which `FORCE ROW LEVEL SECURITY` would handle) — confirmed by querying `pg_roles.rolbypassrls` directly, not assumed. Any Postgres host's default/admin role should be treated with the same suspicion until checked.
- `packages/db/scripts/create-app-role.js` (run via `pnpm --filter @repo/db create-app-role`, needs `DATABASE_URL` + `APP_ROLE_PASSWORD` set) creates/updates this role: grants on all current tables, plus an `ALTER DEFAULT PRIVILEGES` rule so future tables are covered automatically — confirmed working for real when `individual_billing` was added and needed no manual re-grant. Re-run it only if you need to rotate the password.
- Query an RLS-enabled table only through `withOrgScope(organizationId, callback)`, `withUserScope(userId, callback)`, or `withSystemScope(callback)` (`packages/db/src/index.ts`) — never the bare `db` client directly. All three wrap `db.transaction` and set a transaction-local session var (`set_config(..., true)`, bound-parameterized, not string-interpolated `SET LOCAL`) that the table's policy checks via `current_setting(...)`.
  - `withOrgScope` / `withUserScope` — for anything acting on behalf of a live user session that has a real `organizationId` / `userId` (e.g. `enforceSeatLimit` uses `withOrgScope`). Two independent session variables (`app.current_org_id`, `app.current_user_id`), not one shared key — a query could in principle need both, though nothing does yet.
  - `withSystemScope` — bypasses scoping entirely, only for contexts trusted through a _different_ mechanism than a session (e.g. `billing.handlers.ts`'s webhook processing, trusted via Stripe's verified signature; some webhook events don't even carry an owner id to scope to). Never use this for anything reacting to a live user request.
- `.db.ts` functions for an RLS-enabled table take an explicit executor (`tx: DbExecutor`) as their first parameter instead of importing `db` directly — makes it impossible to accidentally query the table outside a chosen scope. `organization-billing.db.ts` / `individual-billing.db.ts` are the reference examples.
- The policy pattern (`organization_billing_isolation`, `individual_billing_isolation`) is `<owner_column> = current_setting('app.current_<owner>_id', true) OR current_setting('app.bypass_rls', true) = 'true'` — `current_setting(..., true)` returns `NULL` (not an error) when unset, so a query that goes through neither helper sees zero rows: fail closed, not fail open.
- **Any new RLS-enabled table needs both `ENABLE` and `FORCE ROW LEVEL SECURITY`, and a real test proving unscoped/wrong-scope access returns nothing** — a policy without `FORCE`, or with the `app_user` role somehow regaining `BYPASSRLS`, fails silently. Don't trust that RLS works because the migration ran; `billing.integration.test.ts`'s and `individual-billing.integration.test.ts`'s "Row-Level Security" describe blocks are the reference examples for how to prove it.
- **Renaming an RLS-enabled table needs a hand-written `RENAME TO` migration, not a `drizzle-kit generate` diff** — a plain rename would otherwise look like drop+recreate to drizzle-kit unless answered interactively (which breaks non-interactive/CI generation). After a hand-written rename migration, also update the corresponding `packages/db/migrations/meta/<n>_snapshot.json` by hand (rename the table key and all its internal name references) so drizzle-kit's own tracked state matches reality — otherwise the next `db:generate` prompts an interactive "created or renamed?" question. `0005_rename_billing_tables.sql` (and its matching hand-edited `0005_snapshot.json`) is the reference example.

## Environment & running things

- Package manager is **pnpm** — don't use npm/yarn.
- **`NODE_ENV` has exactly one source: `cross-env NODE_ENV=<mode>` in each `apps/api` script.** Never set inside a `.env.*` file — `cross-env` sets it before `--env-file` would load, and `--env-file` never overrides an already-set var, so a duplicate line there is inert. There is deliberately no `.env.production` file — production secrets come only from the hosting platform at deploy time.
- `.env.development`/`.env.test` hold the rest of local config, loaded via `tsx`/`node`'s native `--env-file`, no `dotenv`. Vitest's own CLI has no `--env-file` support (why `cross-env` exists at all rather than relying on `--env-file` uniformly) — `apps/api/vitest.setup.ts` calls `process.loadEnvFile()` to cover it.
- `apps/api/src/lib/response.ts`'s `isDev()` is the single place that reads `NODE_ENV` for error verbosity — don't re-derive "are we in dev" elsewhere.
- `pnpm dev` (root) runs all apps via Turborepo; `pnpm --filter @repo/api dev` runs just the API.
- `pnpm db:generate`/`pnpm db:migrate` wrap drizzle-kit, loading `.env.development` themselves. `DATABASE_URL` there points at a real Neon instance — live, not a placeholder. Think about destructive schema changes the way you would against a real staging DB.

## API response shape

Every `apps/api` response — except `/health`, `/api/auth/**` (Better Auth's own client SDK expects its native shape), and `/billing/webhook` (Stripe only checks HTTP status) — uses one envelope via `apps/api/src/lib/response.ts`:

- Success: `success(c, data)` → `{ success: true, data }`.
- Failure: never hand-construct one. `throw new AppError(code, message, details?)` from `@repo/core` and let `app.onError()` (`apps/api/src/app.ts`) format it — preferred over calling `failure()` directly. `code` is one of `ErrorCode` in `packages/core/src/errors.ts` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `PAYLOAD_TOO_LARGE`, `PAYMENT_REQUIRED`, `INTERNAL_ERROR`) — add a new code there, not a bespoke string.
- `details` only ships when `isDev()` is true. Never put anything unsafe-for-production in `message` — it always ships.
- Unexpected exceptions are still caught by `app.onError` into the same envelope (`INTERNAL_ERROR`) — no route needs its own try/catch for shape consistency. That same branch calls `Sentry.captureException(err)` (`apps/api/src/instrument.ts`, gated behind optional `SENTRY_DSN`, no-op if unset) — only for genuinely unexpected errors, not `AppError`/`HTTPException`. Don't scatter `Sentry.captureException` calls elsewhere; this is the one centralized reporting point.

## Testing

Two patterns — use the cheaper one whenever it answers the question:

- **Pure unit** (e.g. `lib/response.test.ts`) — standalone `Hono` instance, driven by `testClient` from `hono/testing`, no real socket/DB. For anything not needing a real session/DB row.
- **Integration** (`*.integration.test.ts`) — import the real `app`, boot with `serve()` on a dedicated port, exercise with real HTTP/WS clients against the real database. Required when the thing under test is a security boundary or needs a real Better Auth session. Every integration test cleans up what it creates in `afterAll`, unconditionally.
- Both patterns exercise the real app/route/middleware code, never a re-implementation.
- No isolated test database exists yet — integration tests run against the dev DB, relying on strict self-cleanup. Check PROGRESS.md before assuming otherwise.

## CI/CD

- **Pre-commit** (Husky + lint-staged, `.husky/pre-commit`): staged `.ts`/`.tsx` get `eslint --fix` + `prettier --write`; staged `.json`/`.md`/`.yaml` get `prettier --write`. Runs automatically, don't bypass with `--no-verify`.
- **CI** (`.github/workflows/ci.yml`, on PR/push to `main`): `quality` job (format check, lint, typecheck, build) must pass before `test` job runs (spins up a real `postgres:16` service, writes its own `.env.development`, runs `pnpm db:migrate` then `pnpm test`).
- CI's `.env.development` sets a fake `STRIPE_WEBHOOK_SECRET` (so self-signed webhook tests still work) but deliberately has no `STRIPE_SECRET_KEY`/`STRIPE_PRICE_STARTER` — this is _why_ `billing.integration.test.ts`'s real-Stripe-checkout test uses `it.skipIf(!process.env.STRIPE_PRICE_STARTER)`. **Any new test needing a real third-party credential must skip gracefully the same way, or CI breaks.**
- Adding a required env var for tests → add it to ci.yml's "Create test environment file" step too, or CI's `test` job fails even though local tests pass.

## Conventions

- TypeScript strict mode everywhere, ESM (`"type": "module"`) in every package.
- Zod v4, not v3 (better-auth's peer dependency forces this repo-wide) — keep all packages on the same major.
- No comments explaining _what_ code does — only _why_, and only when non-obvious.

## Keeping public-facing docs in sync

`README.md`/`CHANGELOG.md` are read by people outside this conversation and go stale silently — update them in the same change, not a follow-up:

- New/changed/removed env var, script, or setup step → README's relevant section.
- A convention change to "how to add a feature" → README's Architecture/Adding-a-feature sections _and_ the relevant rule here.
- Anything a consumer would notice → a CHANGELOG entry. Purely internal changes don't need one.

### Versioning & changelog

Categorize changes like [Conventional Commits](https://www.conventionalcommits.org/); pre-1.0, this repo's convention:

| Type                             | Meaning                           | CHANGELOG section   | Version bump                  |
| -------------------------------- | --------------------------------- | ------------------- | ----------------------------- |
| `feat`                           | New capability                    | `Added`             | minor                         |
| `fix`                            | Bug fix                           | `Fixed`             | patch                         |
| `breaking`                       | Changes/removes existing behavior | `Changed`/`Removed` | minor (major once past 1.0.0) |
| `chore`/`refactor`/`docs`/`test` | No observable behavior change     | none                | none                          |

Bump every workspace `package.json` together (no independent per-package release process). Add the new version's entry at the top of `CHANGELOG.md`.
