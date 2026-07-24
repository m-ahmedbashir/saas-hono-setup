# Security audit — billing & notifications modules

Point-in-time audit (2026-07-18) of every custom module in this repo, focused specifically on: **can an authenticated user read or modify data belonging to another user or another organization**, and are there any Stripe-specific loopholes or leftover "vibecoding" bugs. This is a log, not a rulebook — re-run this audit (or add a new dated section) whenever a module gets meaningfully extended, don't assume it stays true forever.

Method: read every file in scope fresh against the running code (not from memory/assumption), traced every authenticated read/write to its authorization chain, cross-checked against the real integration tests that exercise these paths. No issues below were found by inspection alone without also checking whether a test actually proves the claim.

## Verdict

**The specific thing you were worried about — an authenticated user reading or changing another user's or another org's data — was not found in either module.** Every write in both `billing` and `notifications` is scoped using a value derived from the server-side session (`userContext.organizationId`, `userContext.user.id`), never from client-supplied input. Details below.

## Update — 2026-07-24: Row-Level Security added to `billing`

Everything below this point was true as of the original audit, when the only enforcement on any table was application code. Since then, `billing` also got Row-Level Security as a second, independent layer — see `AGENTS.md`'s Row-Level Security section for the full pattern. Worth logging here specifically: **the first attempt at this was silently ineffective**, caught only because a real proof test was written instead of trusting that "the migration ran" meant "it works."

What happened: the app's DB connection role (Neon's default owner role, `neondb_owner`) had `BYPASSRLS` granted directly on the role itself. `ENABLE`/`FORCE ROW LEVEL SECURITY` were both correctly set on the table, but `FORCE` only overrides _table-owner_ exemption — it does nothing against a role that has `BYPASSRLS` granted directly, which wins regardless. A dedicated test (`billing.integration.test.ts`'s "Row-Level Security" block) querying the table unscoped and asserting zero rows come back failed on its first run — exactly as it should have, since the policy was doing nothing. Fixed by creating a second, restricted `app_user` role (no `BYPASSRLS`) that the app now connects as for all runtime queries, confirmed via `pg_roles.rolbypassrls = false`, and the same test now passes.

The lesson generalizes beyond this one column: **on any Postgres host, verify the app's actual connection role doesn't have `BYPASSRLS`/superuser before trusting that RLS does anything** — don't assume a "just enable RLS" migration is sufficient without a test that proves an unscoped query actually sees nothing.

## Billing module

### `POST /billing/checkout`

Chain: `injectUserContext` → `requirePermission({ billing: ["manage"] })` → `zValidator` → handler.

- The organization being billed (`userContext.organizationId`) comes exclusively from the authenticated session's _active organization_, resolved server-side by Better Auth (`auth.api.getFullOrganization`). The request body (`{ planId, quantity }`) has no field that could name a different org — checked `billing.schema.ts`, confirmed.
- Only `owner`/`admin` roles have been granted `billing: ["manage"]` (`packages/core/src/auth/permissions.ts`) — `memberRole` does not. Confirmed by a real test asserting a member gets 403.
- **Trust boundary, not a gap we introduced**: this relies on Better Auth's own `setActiveOrganization` endpoint only letting a user activate an org they're actually a member of. That's Better Auth's responsibility, not custom code here — reasonable to trust given it's the same library gating every other permission check in this app.

### `POST /billing/webhook`

No user auth (correct — Stripe calls this directly). Trust is entirely the HMAC signature (`Stripe.webhooks.constructEvent`, verified _before_ any payload data is read — confirmed in `stripe-billing.service.ts:82-90`).

- The organization a webhook event updates comes from `client_reference_id`/`metadata.orgId`, which **we** set server-side at checkout-creation time and Stripe echoes back inside the signed event. A payer completing the hosted Stripe Checkout page cannot alter this. Not attacker-controlled.
- Subsequent lifecycle events (`customer.subscription.updated/deleted`) are matched by `providerSubscriptionId`, which Stripe generates and which is unique per subscription created by our own checkout flow (one subscription ↔ one org).
- **Finding (LOW, informational)**: `billing.providerSubscriptionId` has no `UNIQUE` constraint at the DB level (`packages/db/src/schema.ts:157`, only `organizationId` is unique). `updateBillingBySubscriptionId`'s `WHERE providerSubscriptionId = X` would silently update every matching row if a collision ever existed. Not currently exploitable — Stripe subscription IDs are globally unique and our flow only ever creates one subscription per org — but it's a defense-in-depth gap, not a proven bug. Fix if you want to close it: add `.unique()` to that column (would need a migration; a `NULL` default for orgs with no subscription yet is fine under Postgres unique constraints).

### Not yet reachable — not vulnerable, just incomplete

- `updateSubscriptionQuantity` and `cancelSubscription` are fully implemented on `StripeBillingService` and declared on the `BillingGateway` interface, but **zero routes call them** (grepped the whole `apps/api/src` tree, confirmed). There's no "change my seat count" or "cancel my subscription" endpoint yet. Nothing to exploit since nothing reaches them — but also nothing a user can currently do to self-service their subscription beyond the initial checkout.
- `enforceSeatLimit` middleware is correctly scoped (`userContext.organizationId`, B2C bypass, throws `PAYMENT_REQUIRED`) but **is not attached to any route** — confirmed by the same grep. This means seat limits are not actually enforced anywhere live right now; an org on the `free` plan can add unlimited members today because there's no "add org member" endpoint of our own to attach this middleware to (Better Auth's own `addMember`/invite handlers aren't routes we control). Already flagged in `PROGRESS.md`; restating here because it's directly relevant to "is there a loophole" — yes, in the sense that the limit exists in code but not in effect.
- No `GET /billing` (view own org's billing status) route exists — nothing to audit, but worth knowing if you want a billing dashboard later.

### Stripe-specific checks

- No file outside `stripe-billing.service.ts` imports `stripe` (re-confirmed via grep) — the webhook route only ever sees the normalized `BillingEvent` union.
- API key: read from `process.env.STRIPE_SECRET_KEY` only, constructed lazily (not at module load), never logged, never hardcoded. You've already switched it to a restricted key (`rk_test_...`) rather than a full secret key.
- `quantity` is capped (`z.number().int().positive().max(1000)`) — prevents a typo'd/malformed quantity reaching Stripe's API. This is a sanity cap on the _authenticated actor's own org_, not a security boundary (self-service, same-org-only either way).
- Webhook signature verification uses the static `Stripe.webhooks.constructEvent` (needs only `STRIPE_WEBHOOK_SECRET`, not the API key) — correctly scoped to the one secret that actually matters for this check.

## Notifications module

### `GET /ws/:userId`

Chain: `requireAllowedOrigin` → `injectUserContext` → `requireSelfParam("userId", ...)`.

- `requireSelfParam` rejects unless `userContext.user.id === c.req.param("userId")` — the _only_ value that can ever open a socket for `userId` is that authenticated user themselves. Confirmed by a real test: a session for user A requesting `/ws/<user-B-id>` gets 403.
- `requireAllowedOrigin` closes the cross-site WebSocket hijacking gap (WS handshakes aren't covered by CORS) — confirmed by a real test with a disallowed `Origin` header.

### `notificationDispatcher.send()`

Not called from any production code path — only from the test file (grepped, confirmed). There's no feature yet that actually triggers a notification to be sent; the dispatcher only currently handles WS connect/disconnect. **Nothing to audit here yet — but flagging for whenever this gets built**: the `userId` argument to `send()` must always be derived server-side from whatever resource/event triggered the notification (e.g., "notify the owner of order X"), never taken from client-supplied input, or that becomes exactly the kind of loophole you're worried about.

## General code-quality check ("vibecoding" leftovers)

Grepped both modules and all related middleware for `TODO`/`FIXME`/`XXX`/`console.log`/`debugger` — none found. No dead/leftover debug code in scope.

## What this audit did not cover

- The rest of the app (auth routes, the underlying Better Auth configuration itself) — out of scope for this pass, which was specifically billing + notifications per your request.
- Load/rate-limit/DoS concerns — deliberately excluded, different threat category than "can user A touch user B's data."
- Anything not yet built (billing dashboard, subscription self-service, actual notification triggers) — can't audit code that doesn't exist; noted above as gaps to revisit when built.
