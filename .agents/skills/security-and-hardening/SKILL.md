---
name: security-and-hardening
description: Audits security and production-readiness across apps/api, apps/admin, and packages/db|core in this monorepo. Use before a production deploy, before merging a feature branch, when asked to "check for production issues," or for a security/hardening pass on the whole codebase or one module — not scoped to a single PR diff.
---

# Security and Hardening

## Overview

A structured, codebase-specific audit for this repo (`saas-hono-setup`: Hono API in `apps/api`, Next.js admin in `apps/admin`, Drizzle/Postgres in `packages/db`, domain logic in `packages/core`). It checks that new and existing code actually follows the security/production patterns this repo has already established — RLS scoping, permission middleware, webhook signature verification, the response envelope, env-driven config — rather than applying generic OWASP boilerplate that doesn't fit this architecture.

**Relationship to `/security-review`:** `/security-review` is a diff-scoped, multi-agent cloud review of the current branch or a PR — use it for "review what I just changed." This skill is for a broader, in-session sweep: a whole module, the whole app, or a pre-launch check — run it when there's no diff to scope to, or when you want production-readiness checked alongside security.

## When to Use

- Before merging a feature branch into `main` or deploying to production
- When asked to check for "production issues," "security issues," or "is this ready to ship"
- After adding a new route, table, or external integration (Stripe, a new webhook, a new third-party API)
- Periodically on the whole codebase, not just recently-changed files

## How to Run

1. **Scope it.** Default to the whole repo; if the user names a module/path/feature, restrict to that plus anything it touches (routes → service/handlers → db → schema).
2. **Walk the checklists below**, layer by layer, only for layers actually in scope.
3. **Every finding must cite a real `file:line`** and a concrete failure/exploit scenario grounded in this repo's actual code — not a hypothetical. If you're not looking at the line, don't report it.
4. **Verify against the pattern, not a generic rule.** E.g. "doesn't use `withOrgScope`" is only a finding if the table is RLS-enabled; check `schema.ts` and the migrations before flagging.
5. Report using the format in **Output Format** below.

## Layer 1: Backend (`apps/api`)

### Authorization

- Every route has `injectUserContext` unless it's `modules/auth/auth.routes.ts` (proxies to Better Auth, unauthenticated by design) or another route with an equally explicit, commented reason.
- Every route gated by role/permission uses `requirePermission(...)` (org-level) or `requirePlatformPermission(...)` (platform-admin level) — not a hand-rolled `if (userContext.role !== ...)` check.
- No route trusts a client-supplied `organizationId`/`userId` in the body/query as the scope for a write — the scope comes from `userContext` (session) or an explicit ownership check in `.db.ts`, never from an unvalidated request field.
- B2C/ownership-only routes (no org, e.g. `/profile`, `/billing/individual-checkout`, `DELETE /account`) scope by `userContext.user.id`, not by a client-passed id.
- `withSystemScope` is used only for genuinely platform-trusted contexts (webhook processing verified by signature, platform-admin service functions already gated by `requirePlatformPermission` upstream) — never for code reacting to a live user request. Check the call site one level up, not just the `.db.ts` function.
- A direct `auth.api.*` call made with no `headers`/session (the "trusted server-action path" per AGENTS.md) is only safe because Better Auth's own permission checks only run `if (session)` — confirm the calling function is itself gated by `requirePlatformPermission` or equivalent before it ever runs, don't assume the headerless call is a security boundary on its own.

### Input Validation

- Every route with a body/query uses `zValidator(target, schema, hook)` as route middleware with the required `hook` (re-throwing `AppError("VALIDATION_ERROR", ...)`) — not `.safeParse()` inside the handler, not raw `c.req.json()`.
- Third-party responses (Stripe, any future external API) are treated as untrusted — checked/narrowed before being used in logic, never passed through to a DB write or response unshaped.
- No Drizzle query builds a `WHERE`/`ORDER BY` clause from raw string interpolation — only `eq`/`lt`/`ilike`/etc. re-exported from `@repo/db`.

### Webhooks & External Integrations

- Every inbound webhook verifies a signature (`Stripe.webhooks.constructEvent` or equivalent) before parsing the payload — signature check must happen before any DB write, not after.
- A new Stripe (or other vendor) event type added to a `parseWebhookEvent`-style switch doesn't leak the vendor's raw SDK type outside its one adapter file (`stripe-billing.service.ts` is the only file allowed to import `stripe`, per AGENTS.md's Billing model section) — check `grep -r "from \"stripe\"" apps/api/src` turns up exactly one file.
- Secrets (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, etc.) are read from `process.env` lazily, with a clear thrown error if missing — never a fallback default, never hardcoded.

### Error Handling & Data Shaping

- Handlers throw `AppError(code, message, details?)` rather than hand-constructing a response — `code` is a real `ErrorCode` from `packages/core/src/errors.ts`, not a bespoke string.
- `details` never carries anything unsafe for production (stack traces, raw DB errors, internal ids not meant for the client) — `message` always ships regardless of `isDev()`, so nothing sensitive belongs there either.
- No `.db.ts` function returns a raw `db.select().from(table)` row to the caller unshaped — check for accidental leakage of columns like password/session-adjacent fields, `stripeCustomerId`-style internal ids, or other users' data via an unfiltered join.
- A `catch` block that's expected/self-healing (e.g. a race where a dependent event hasn't arrived yet) logs via `console.warn`, not silently swallowed and not left to hit Sentry as a false-positive incident — confirm the re-throw actually happens so retry logic (Stripe's redelivery, a queue) still fires.

## Layer 2: Data Layer (`packages/db`, `packages/core`)

### Row-Level Security

- Every table holding per-org or per-user data is either RLS-enabled (`ENABLE` **and** `FORCE ROW LEVEL SECURITY` — check the migration SQL directly, not just that a policy exists) or has an explicit, commented reason it isn't (system-populated/global reference table, or a Better-Auth-generated table Better Auth itself queries).
- Every `.db.ts` function for an RLS-enabled table takes an explicit `tx: DbExecutor` parameter rather than importing the bare `db` client — a function that imports `db` directly to query an RLS table is a way to accidentally bypass scoping.
- `AnyExecutor` is only used for genuinely non-RLS tables (system-populated catalogs, Better-Auth-generated tables) — if it's used on a table that should be RLS-scoped, that's a real finding, not a style nit.
- A new RLS-enabled table has an integration test proving unscoped/wrong-scope access returns zero rows (the "Row-Level Security" describe-block pattern in `billing.integration.test.ts`) — a policy with no test is unverified, not proven.
- An immutable/audit table (an append-only ledger) has its `REVOKE UPDATE, DELETE ... FROM app_user` migration actually applied — check the migration file exists and was run, and that the grant-restriction was verified against the real `app_user` role (not just the owner/migration role, which bypasses it).

### Migrations & Schema

- Destructive changes (`DROP COLUMN`, adding `NOT NULL` with no default, narrowing a type) are called out explicitly — not silently bundled into an unrelated feature migration.
- A hand-written migration (RLS grants, a table rename) has its matching `meta/<n>_snapshot.json` updated by hand so drizzle-kit's tracked state doesn't drift and prompt an interactive question on the next `db:generate`.
- Foreign keys on high-value data (billing records, audit logs) have deliberate `onDelete` behavior — an unreviewed `CASCADE` on a ledger/receipt table is a real data-loss risk, not just a style choice.
- No type in `apps/api`/`apps/admin` hand-duplicates a Drizzle table shape or Zod schema instead of deriving it (`typeof table.$inferSelect`, `z.infer<typeof Schema>`) — a hand-duplicated type silently drifts from the real shape and can under- or over-expose fields.

### Domain Layer

- `packages/core` has no import of Hono, HTTP, or a live `stripe`/vendor SDK — it must stay usable from a script or test with no server running.
- `packages/core/src/index.ts`'s barrel isn't imported from browser/client code when it (or a file it re-exports) constructs a live DB connection at module load — client code must import a dedicated side-effect-free subpath instead (see `platform-permissions` in AGENTS.md's apps/admin section for the reference pattern). Grep `apps/admin/src` for `from "@repo/core"` (not a subpath) and check each hit.

## Layer 3: Frontend (`apps/admin`)

### Client-Side Auth Is UX Only

- Any client-side gate (`PlatformAccessGate`, a `useSession()` role check, `nav-config.ts`'s `access` rules) is confirmed to have a matching **server-side** enforcement for every action it gates — a hidden button is not a security control. If a new gated feature calls `authClient.admin.*` or `apiFetch`, verify the corresponding `apps/api` route or Better Auth plugin actually re-checks permission server-side.
- `src/proxy.ts`'s dashboard gate is presence-only (`getSessionCookie`, no DB round-trip) — don't treat it as real session validation, and don't flag it as a bug; flag it only if a new route relies on it as if it were.

### XSS & Unsafe Rendering

- No `dangerouslySetInnerHTML` (or equivalent) renders content that isn't from a trusted, sanitized source. React/Next auto-escape everywhere else — don't flag ordinary JSX interpolation.
- External links built from data that ultimately originates outside this app's own signature-verified backend (not Stripe-signed webhook data, which is trusted) use `rel="noreferrer"` alongside `target="_blank"`.

### Data Exposure

- A feature's `types.ts` mirrors only the fields the corresponding `apps/api` response actually needs exposed — not a wider shape that happens to typecheck against a larger backend interface.
- No `console.log`/`console.error` in shipped code prints a full user/session/token object — logging an id or a URL is fine; logging credentials, full PII records, or session payloads is not.
- Secrets or internal-only values never end up in a `NEXT_PUBLIC_*` env var — anything with that prefix is bundled into the client and publicly readable.

### Requests

- `apiFetch`/direct `fetch` calls to `apps/api` send `credentials: "include"` only where a session cookie is actually required — an unauthenticated public read doesn't need it.
- A server-side RSC data fetch that needs the caller's session forwards the cookie explicitly via `next/headers`'s `cookies()` — Next does not do this automatically, and a missing forward silently produces an unauthenticated request that may fail open into a public/default response instead of erroring loudly.

## Cross-Cutting Production Readiness

- **Config fails loudly, not silently.** A required env var (`APP_DATABASE_URL`, `STRIPE_WEBHOOK_SECRET`, etc.) throws a clear error at import/first-use time if unset — never flows through as `undefined` into query/business logic.
- **Observability matches severity.** Genuinely unexpected errors reach Sentry (`apps/api/src/instrument.ts`, gated on `SENTRY_DSN`) via the one centralized `app.onError` path — don't flag missing per-route try/catch as a gap, that's by design. Expected/self-healing races use `console.warn`, not an uncaught throw that would falsely page someone.
- **Pool/connection limits are explicit**, not left at a driver's default that silently caps concurrency or hangs forever on a full pool (`DB_POOL_MAX`/`DB_POOL_IDLE_TIMEOUT_MS`/`DB_POOL_CONNECTION_TIMEOUT_MS` pattern) — a new long-lived connection or worker introduced elsewhere should follow the same explicit-timeout discipline.
- **Idempotency for anything retried.** A new webhook consumer or at-least-once delivery path has an inbound idempotency guard (unique constraint + `onConflictDoNothing`, matching the `billing_events` pattern) before it does anything with side effects.
- **Versioning discipline.** A change that ships observable behavior has a CHANGELOG entry and a version bump matching AGENTS.md's `feat`/`fix`/`breaking` table — flag a shipped feature with neither, not as a security issue but as a process gap worth naming.
- **Tests prove the negative, not just the positive.** A new permission/RLS boundary has a test asserting the wrong-scope/no-permission case is actually denied (403, zero rows) — a test suite that only exercises the happy path hasn't proven the boundary holds.

## Output Format

Report grouped by layer, most severe first:

```markdown
### <Layer> — <file>:<line>

- **Severity**: Critical | High | Medium | Low
- **Category**: authz | authn | injection | data-exposure | rls | production-hardening | ...
- **Finding**: <one sentence, the defect itself>
- **Scenario**: <concrete input/state → concrete bad outcome, in this codebase>
- **Fix**: <specific change, referencing the existing pattern it should follow>
```

Don't report:

- Anything without a real `file:line` you've actually read
- A deviation from a generic rule that this repo has already deliberately and explicitly chosen not to follow (e.g. `proxy.ts`'s presence-only check, `withSystemScope` in webhook handlers) — read the surrounding comment before flagging a documented tradeoff as a bug
- Purely theoretical issues with no concrete path through this codebase's actual routes/data

## Red Flags

- A new RLS-enabled table with no `FORCE ROW LEVEL SECURITY` or no negative-access test
- A new route with no `injectUserContext`/`requirePermission` and no comment explaining why
- A `.db.ts` function importing the bare `db` client instead of taking `tx: DbExecutor`
- A second file importing `stripe` (or any single-adapter vendor SDK) outside its designated adapter
- A webhook/event handler with no signature check or no idempotency guard
- A client-side-only permission check with no corresponding server-side enforcement
- A secret read with a silent fallback instead of a thrown error
- `console.log` of a full user/session object

## Verification

Before calling the audit complete:

- [ ] Every finding cites a real `file:line` that was actually read during this pass
- [ ] Every finding has a concrete scenario, not a hypothetical
- [ ] Findings span every layer actually in scope — don't skip the data layer because it's less familiar
- [ ] Each fix recommendation points at an existing pattern already used elsewhere in this repo, not a newly-invented one
- [ ] Documented, deliberate tradeoffs (found via a comment explaining "why") were checked before being flagged, not reported as bugs
