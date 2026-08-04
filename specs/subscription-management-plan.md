# Subscription Management Module — Implementation Plan

## Goal

Make subscription plans admin-editable from `apps/admin`, while preserving typed
feature/limit keys and following the DDD/layering + SOLID rules in `AGENTS.md`.

## Industrial approach

The standard SaaS pattern for "admin can change plans but the app stays typed" — same
shape Stripe itself uses (mutable Products/Prices, code-side feature gating) — is:

1. **Two closed vocabularies stay in code, forever.** `FeatureKey` and `PlanLimitKey`
   (`packages/core/src/billing/entitlements.ts`) are the only capabilities the app can
   ever enforce or display. Admins can toggle these known keys on/off per plan; adding a
   genuinely new capability still requires a code change, on purpose — the code cannot
   enforce a feature it has never heard of. This is the one part of "the app stays
   typed" that must never be relaxed, no matter what else moves to the DB.
2. **The plan catalog moves to the database.** Each plan row stores which of the known
   keys are enabled/what limits are set, as JSONB maps. Admins create/edit plans and
   toggle features within the closed catalog above, without a deploy. Because plans are
   now DB-editable, `OrganizationPlanId`/`IndividualPlanId` necessarily widen to `string`
   — you cannot keep a compile-time union of an admin-editable set of rows. This is a
   real, deliberate loss of a compile-time guarantee (see "Preserving the typed
   guarantee at runtime" below for what replaces it), not a free simplification.
3. **Public vs private/custom plans.** The plan table has a nullable `organizationId`
   column. `NULL` means a shared/public plan (free, starter, growth, etc.) any org can
   subscribe to. A value means a custom/negotiated plan for that one organization only —
   used for enterprise deals with custom features or pricing.
4. **Pricing is decoupled from plan definition.** Each plan stores a `providerPriceId`
   (Stripe Price ID). For custom plans, the admin pastes in the Stripe price ID
   negotiated for that customer. Automated Stripe product/price creation is a later
   iteration — v1 uses manual entry to avoid coupling the core design to Stripe product
   creation.
5. **Runtime resolution is a two-step pipeline, and stays entirely inside `apps/api`.**
   Fetch the plan row (`apps/api`/`packages/db`) → normalize its JSONB into a
   `PlanEntitlements` object, re-validated against the closed key vocabularies (pure,
   `packages/core`) → hand that to the existing pure `canAccessFeature`/`getPlanLimit`
   functions, unchanged in spirit. `packages/core` never gains DB access to do this
   itself — see the DIP guardrail below.
6. **Seed defaults.** The current hardcoded `free`/`starter`/`growth` and
   `individual_free`/`individual_pro` plans become seed rows in a migration, so existing
   billing rows continue to resolve.

### Preserving the typed guarantee at runtime (not just at the write boundary)

Today, `Record<OrganizationPlanId, PlanEntitlements>`'s exhaustiveness is a compile-time
guarantee: a plan id with no entitlements entry is a `tsc` error, not a silent gap
(`ENTITLEMENTS.md`). Widening the plan id to `string` deletes that guarantee — a
replacement is required on **both** sides, not just the write side:

- **Write side** (already in the original plan): `POST`/`PATCH /subscription-plans`
  validates `features`/`limits` keys against `FeatureKey`/`PlanLimitKey` via Zod before
  the row is ever stored.
- **Read side** (the actual gap in the original plan): a `FeatureKey` renamed or removed
  in a later code change must not let a stale DB row referencing the old key keep
  resolving as if it were still valid. Add a pure normalizer —
  `resolvePlanEntitlements(raw: { features: Record<string, boolean>; limits: Record<string, number> }): PlanEntitlements`
  in `packages/core/src/billing/entitlements.ts` — that re-validates the row's JSONB on
  every read: unknown keys are dropped, missing known keys default to `false`/`0`. This
  keeps `PlanEntitlements` itself exactly as closed as it is today; only the _source_ of
  the raw data changed from a compiled map to a DB row.
- **Fallback for a genuinely missing plan row — not for a DB error, see item 3 below.**
  Today, `organizationPlanEntitlements.free` is pure code — it resolves even if Postgres
  is down. Once resolution is a DB read, that property needs a deliberate, narrow
  replacement: one small hardcoded `fallbackEntitlements: PlanEntitlements` constant
  (deny-most: all features `false`, conservative limits), used only when a billing row
  references a `planId` with no matching row at all (e.g. a seed gap) — never for a
  live plan row that's merely `isActive: false` (a deactivated plan still resolves its
  real entitlements; deactivation only blocks _new_ checkouts, see "Closing the
  payment-correctness gaps" and the "Deactivating a plan" walkthrough below) and never
  for a DB error (see item 3 — those must propagate, not fall back).

### DIP guardrail

`packages/core` must never gain a DB call to resolve a plan by id, even for convenience.
Resolving a plan row is `apps/api`'s job (`subscription-plans.service.ts`); `packages/core`
only ever receives already-fetched raw JSONB and normalizes/checks it. This mirrors the
existing split in `entitlement.middleware.ts` (DB fetch in `apps/api`, pure check in
`packages/core`) — the new plan table doesn't change who's responsible for what, only
where the plan data itself lives.

### Internal resolution never goes through the HTTP route

`entitlement.middleware.ts`, `seat-limit.middleware.ts`, and `stripe-billing.service.ts`
all call `subscription-plans.service.ts`/`subscription-plans.db.ts` **directly**, in
process — never an HTTP round-trip to `GET /subscription-plans`. The HTTP route's only
consumer for now is the admin UI (list/edit). A public, unauthenticated pricing-page
route is realistic future work, but nothing in this repo needs it yet — per AGENTS.md's
"don't scaffold ahead of the task" rule, `GET /subscription-plans` stays gated the same
as every other route in this module (`requirePlatformPermission`, `list` granted to both
`admin` and `support`, same read-only-tier pattern as the rest of platform admin) until a
real caller needs a more public path.

### Closing the payment-correctness gaps found in review

Found by comparing this design against Stripe's own documented subscription-billing
guidance, not just this repo's conventions. Each of these is a concrete mechanism, not
just a flagged risk — implementation must include all six:

1. **A `providerPriceId` is validated against Stripe before it's ever saved, not
   discovered broken at a real customer's checkout.** `BillingGateway`
   (`packages/core/src/billing/types.ts`) gets a new method,
   `validatePriceId(priceId: string): Promise<{ active: boolean; recurring: boolean }>`
   — vendor-agnostic contract, same shape as every other `BillingGateway` method.
   `StripeBillingService` implements it via `stripe.prices.retrieve(priceId)` (the only
   file allowed to touch the `stripe` package, per `AGENTS.md`'s billing rule — this is
   why the check can't live directly in `subscription-plans.service.ts`).
   `subscription-plans.service.ts` calls it on `POST`/`PATCH` whenever a non-null
   `providerPriceId` is being set or changed, and rejects the write
   (`VALIDATION_ERROR`) unless the price exists, is `active`, and has `recurring` set.
2. **"Exactly one default plan per `ownerType`" is a database constraint, not just an
   application check.** A partial unique index —
   `CREATE UNIQUE INDEX ... ON subscription_plans (owner_type) WHERE is_default = true AND organization_id IS NULL`
   — is the actual backstop. The service layer still does the friendly
   unset-old/set-new sequence in one transaction, but a concurrent race now hits a real
   constraint violation (caught and returned as a clean `VALIDATION_ERROR` — "default
   plan was changed concurrently, retry" — not a raw Postgres error, and never silently
   allowing two defaults to exist).
3. **Plan-resolution failure modes are handled differently on purpose, not lumped
   together.** `subscription-plans.service.ts`'s `resolveEntitlementsForPlan`:
   - Row genuinely doesn't exist — a completed query returning nothing, e.g. a seed
     gap or a billing row referencing a `planId` that was never created. **Not** a
     deactivated plan: `isActive: false` rows still exist and still resolve their real
     entitlements normally (deactivation only blocks _new_ checkouts — see the
     "Deactivating a plan" walkthrough below). Only true absence returns
     `fallbackEntitlements`, logged as a warning (this is a data-integrity gap worth
     fixing, not a live outage — the app should survive it, not silently repeat it
     forever unnoticed).
   - The query itself throws (DB connection error, timeout) → **let it propagate**,
     same as any other unexpected error (`app.onError`'s existing `INTERNAL_ERROR` path,
     which already reports to Sentry). Do not catch this into `fallbackEntitlements` —
     silently downgrading a paying customer to deny-most entitlements because of a
     transient DB blip is its own bug, arguably worse than a visible 500.
4. **Editing a plan's `features`/`limits` takes effect immediately for every current
   subscriber on it — stated here as a deliberate decision, not an implicit side
   effect.** No versioning or audit trail in v1 (see "Out of scope") — `updatedAt` is
   the only record that a change happened. If this repo later needs "what did this plan
   look like on the day a customer signed up," that's a real, separate feature
   (plan versioning), not a bolt-on to this one.
5. **Editing `providerPriceId` never touches subscribers already on the plan.** Stripe
   subscriptions carry their own price reference from the actual subscription object;
   our `providerPriceId` column only feeds the _next_ checkout. To make this visible
   instead of a surprise: `GET /:ownerType/:planId` includes an `activeSubscriberCount`
   field (a `withSystemScope` count against `organization_billing`/`individual_billing`
   filtered by `plan = planId`, matching the `ownerType`) and the admin UI's edit sheet
   shows a warning banner — "N active subscription(s) on this plan won't be affected by
   a price change" — whenever `providerPriceId` is edited on a plan with
   `activeSubscriberCount > 0`.
6. **Deactivating or un-defaulting the current default plan for an `ownerType` is
   blocked, not silently allowed — and so is deactivating the last remaining active
   shared plan, even if it happens not to be the default.** `subscription-plans.service.ts`'s
   update path throws `VALIDATION_ERROR` ("assign a different default plan for this
   ownerType first") whenever a write would leave an `ownerType` with zero
   `isActive: true` shared (`organizationId IS NULL`) plans, or with active shared
   plans but none of them `isDefault: true`. Phrasing the guard only as "no default
   among the active ones" has a gap: deactivating the very last active shared plan
   makes that condition vacuously true (there's nothing left to check), which would
   silently let new signups end up with zero resolvable plans — checking "at least one
   active shared plan exists, and it includes the default" closes that loophole.
   Without this, new signups silently fall to `fallbackEntitlements` (deny-most) until
   someone notices.

## Scope boundaries

- **Admin can:** create/edit shared plans, create custom plans tied to one organization,
  rename them, change seat limits, set Stripe price IDs, toggle known features, set known
  limits, activate/deactivate plans, mark a plan as the default for new signups of its
  `ownerType`.
- **Admin cannot:** invent new feature keys the app does not know about (requires a code
  change) or delete a plan (see "No hard delete" below).
- **Plan IDs become runtime strings.** The known seed IDs remain as seed data, not
  compile-time constraints.
- **Custom pricing is via Stripe price ID.** Automated Stripe product/price creation is
  out of scope for this change.
- **No hard delete.** Stripe itself never lets you delete a Price that's ever been used —
  it archives it. This module has the same shape of problem and the same answer:
  `isActive: false` is the only supported way to retire a plan. A `DELETE` route that
  first has to prove "no billing row references this" is redundant surface for a case
  `isActive` already covers, and races against a concurrent checkout. Not building it.

## Assumptions

- Plans are stored in one `subscription_plans` table with an `ownerType` discriminator
  (`organization` | `individual`), rather than two duplicate tables.
- The table is global config, not RLS-scoped per owner — it isn't owner-scoped app data
  the way `organization_billing`/`profile` are, it's platform configuration. Reads go
  through the same platform-permission gate as the rest of this module (see "Internal
  resolution never goes through the HTTP route" above); writes are gated by platform
  admin permission specifically (`manage`, not just `list`).
- `isActive` disables a plan from new checkouts without deleting historical rows.
  `isDefault` marks the plan a new signup with no billing row yet resolves to, per
  `ownerType` — this is what `entitlement.middleware.ts`/`seat-limit.middleware.ts`
  replace today's hardcoded `"free"`/`"individual_free"` fallback string with. Exactly
  one **shared** (`organizationId IS NULL`) plan per `ownerType` must be marked
  default, and at least one active shared plan must always exist per `ownerType` — both
  enforced for real by the partial unique index and service-layer guard in "Closing the
  payment-correctness gaps" items 2 and 6, not left as an unenforced convention.
- Existing `organization_billing.plan`/`individual_billing.plan` values are already
  strings in the DB, so no data migration is needed beyond seeding the plan rows
  themselves.

## Files and changes

### 1. Database (`packages/db`)

- `packages/db/src/schema.ts`
  - Add `subscriptionPlans` table:
    - `id` text PK
    - `ownerType` text not null (`organization` | `individual`)
    - `planId` text not null — slug-like identifier, unique **within its scope** (see
      index note below), not globally unique
    - `organizationId` text nullable FK to `organization.id` (set ⇒ private/custom plan
      for that org only)
    - `name` text not null
    - `description` text
    - `seatLimit` integer (null for individual plans)
    - `providerPriceId` text (null for free/handled-offline plans)
    - `features` jsonb not null default `{}`
    - `limits` jsonb not null default `{}`
    - `isActive` boolean not null default true
    - `isDefault` boolean not null default false
    - `createdAt` / `updatedAt` timestamps
    - **Two separate unique indexes, not one — a real bug caught by a failing test
      during implementation, not by reasoning alone.** The original plan for this
      section claimed a single `(ownerType, planId, organizationId)` unique index would
      cover both cases ("Postgres treats NULL as distinct from any other NULL in a
      unique index, so shared plans naturally still get real uniqueness among
      themselves"). That's true of the _claim_ about NULL, but wrong about its
      consequence: NULL being distinct from every other NULL means a plain unique index
      does **not** enforce uniqueness among rows that are all NULL in that column —
      two shared plans (`organizationId IS NULL` on both) never collide on it. Verified
      directly: an integration test creating two shared plans with the same `planId`
      expected a 422 and got 200 until this was fixed. The actual design needs both:
      - `(ownerType, planId, organizationId)`, plain unique index — protects one
        organization from creating two custom plans with the identical `planId` slug
        (`organizationId` is a real, equal, non-null value on both rows here, so this
        one genuinely works).
      - `(ownerType, planId)`, **partial** unique index `WHERE organizationId IS NULL`
        — the only way to get real uniqueness among _shared_ plans. Two different
        organizations' custom plans reusing the same slug are unaffected by this index
        (their `organizationId` is set and different, so neither matches the `WHERE`
        clause).
    - index on `(ownerType, organizationId, isActive)`
    - **partial unique index**: one `isDefault: true` row per `ownerType` among shared
      plans — `CREATE UNIQUE INDEX subscription_plans_one_default_per_owner_type ON subscription_plans (owner_type) WHERE is_default = true AND organization_id IS NULL`.
      This is the actual backstop for the "exactly one default" invariant (see "Closing
      the payment-correctness gaps" above) — the service-layer check alone can't close
      a concurrent-write race.
- `packages/db/src/subscription-plans.ts` (new)
  - Query helpers: `getPlanById`, `listPlans`, `createPlan`, `updatePlan`,
    `planIdExists`, etc.
  - Takes `AnyExecutor`, not `DbExecutor` — this table is not RLS-enabled (global
    config, not owner-scoped data), same reasoning `AGENTS.md` documents for
    `account.db.ts`'s non-RLS tables (`member`/`organization`/`user`). Don't use the
    stricter `DbExecutor` here; there's no scope to get wrong.
- Migration: create table + seed existing five plans using env vars
  `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_INDIVIDUAL_PRO` (or `null`
  if unset), matching current hardcoded features/limits/seat limits. `free` and
  `individual_free` are seeded with `isDefault: true`; all others `false`.

### 2. Domain (`packages/core`)

- `packages/core/src/billing/entitlements.ts`
  - Keep `FeatureKey`, `PlanLimitKey`, `PlanEntitlements` — unchanged, still closed.
  - **Add runtime companions `featureKeys`/`limitKeys`** — `FeatureKey`/`PlanLimitKey`
    are compile-time-only type unions today, with nothing to hand Zod at runtime.
    Without this, `subscription-plans.schema.ts`'s `z.enum(featureKeys)`/
    `z.enum(limitKeys)` (see section 3) has no actual source to reference, and the
    write-side validation this whole design leans on doesn't exist. A bare hand-typed
    array (`["priority_support", "advanced_analytics", ...]`) would silently drift from
    the union the moment someone adds a `FeatureKey` and forgets the array — exactly
    the kind of gap this doc has been closing everywhere else. Instead, derive them the
    same exhaustiveness-checked way `billing.schema.ts` derives `individualPlanIds`
    from `individualPlans` (`Object.keys(...)` off a real object): add a small
    `featureKeyRegistry: Record<FeatureKey, true>` object (and `limitKeyRegistry:
Record<PlanLimitKey, true>`) — omitting a `FeatureKey` from the registry is a
    `tsc` error, not a silent gap — then `featureKeys = Object.keys(featureKeyRegistry) as [FeatureKey, ...FeatureKey[]]`
    (same for limits).
  - Add `resolvePlanEntitlements(raw: { features: Record<string, boolean>; limits: Record<string, number> }): PlanEntitlements`
    — pure normalizer, drops unknown keys, defaults missing known keys to `false`/`0`.
    This is what makes the read side of "typed but DB-editable" real (see "Preserving
    the typed guarantee at runtime" above) — not optional polish.
  - Add one small `fallbackEntitlements: PlanEntitlements` constant (deny-most) for when
    a plan row can't be resolved at all.
  - Change `canAccessFeature(entitlements, feature)` and `getPlanLimit(entitlements, limit)`
    to accept a resolved `PlanEntitlements` directly instead of a `BillingOwner` — the
    DB/HTTP-free resolution responsibility moves entirely to `apps/api`.
  - Remove the hardcoded `organizationPlanEntitlements`/`individualPlanEntitlements`
    maps — their job is now: seed data (migration) + `resolvePlanEntitlements` +
    `fallbackEntitlements`.
- `packages/core/src/billing/types.ts`
  - Change `OrganizationPlanId` and `IndividualPlanId` to `string` aliases.
  - **Remove `OrganizationPlanConfig`/`IndividualPlanConfig` and the two hardcoded
    `organizationPlans`/`individualPlans` maps entirely — not "update or remove," a
    firm decision.** `apps/api`/`apps/admin` use `packages/db`'s
    `typeof subscriptionPlans.$inferSelect` row type directly, per `AGENTS.md`'s "never
    hand-write a type duplicating a Drizzle table" rule. Keeping both a Drizzle row
    type and a hand-maintained config type for the same plan would be exactly the
    second, competing shape `AGENTS.md` warns against — there's no case where they'd
    ever legitimately diverge.
  - Update `BillingEvent.checkout_completed.planId` to `string`.
  - Update `BillingGateway` signatures to accept `planId: string`.
  - Add `validatePriceId(priceId: string): Promise<{ active: boolean; recurring: boolean }>`
    to the `BillingGateway` interface — vendor-agnostic contract, no `stripe` import
    here. This is what lets `subscription-plans.service.ts` verify an admin-entered
    price id without becoming the second file in the codebase importing `stripe`
    (see "Closing the payment-correctness gaps" item 1).

### 3. API (`apps/api`)

- New module `apps/api/src/modules/subscription-plans/`
  - `subscription-plans.routes.ts` — mounted at `/subscription-plans`
    - `GET /` — list plans (query: `ownerType`, `isActive`) — `list` permission (admin +
      support, same read-only-tier pattern as the rest of platform admin)
    - `GET /:ownerType/:planId` — get single plan — `list` permission
    - `POST /` — create plan — `manage` permission (admin only)
    - `PATCH /:ownerType/:planId` — update plan — `manage` permission (admin only)
    - No `DELETE` route (see "No hard delete" above)
  - `subscription-plans.controller.ts` — named handlers only
  - `subscription-plans.service.ts` — business logic, including:
    - `resolveEntitlementsForPlan(ownerType, planId)` — the one function
      `entitlement.middleware.ts`/`seat-limit.middleware.ts` call directly (in-process,
      no HTTP hop) to get a normalized `PlanEntitlements`. Returns `fallbackEntitlements`
      only when the row genuinely doesn't exist; lets a real DB error propagate
      unchanged (see "Closing the payment-correctness gaps" item 3 — these are not the
      same case and must not be handled the same way).
    - On `POST`/create and `PATCH`/update: if `providerPriceId` is being set or changed,
      calls `billingService.validatePriceId(...)` first and rejects the write
      (`VALIDATION_ERROR`) if it's missing, inactive, or non-recurring (item 1).
    - On `PATCH`/update: rejects with `VALIDATION_ERROR` (item 6) if the write would
      leave the plan's `ownerType` with zero active shared plans, or with active shared
      plans but none marked `isDefault` — covers both "deactivating/un-defaulting the
      current default with nothing else to take over" and "deactivating the last
      active shared plan outright," the latter being the vacuous-truth case item 6
      calls out explicitly.
    - On `PATCH`/update setting `isDefault: true`: unsets the previous default and sets
      the new one in the same transaction as the partial unique index (item 2) — a
      concurrent conflicting write surfaces as a constraint violation, caught and
      re-thrown as a clean `VALIDATION_ERROR`.
    - `getPlanWithSubscriberCount(ownerType, planId)` — backs `GET /:ownerType/:planId`,
      adds `activeSubscriberCount` (a `withSystemScope` count against
      `organization_billing`/`individual_billing`, filtered by `plan = planId` and
      matching `ownerType`) so the admin UI can warn before a price edit (item 5).
  - `subscription-plans.db.ts` — queries, `AnyExecutor`
  - `subscription-plans.schema.ts` — Zod create/update/list schemas
    - `planId`: slug-safe string
    - `ownerType`: `z.enum(["organization", "individual"])`
    - `organizationId`: optional string (present ⇒ private/custom plan)
    - `features`: `z.record(z.enum(featureKeys), z.boolean())`
    - `limits`: `z.record(z.enum(limitKeys), z.number().int().nonnegative())`
    - `providerPriceId`: optional Stripe price ID string
- `apps/api/src/app.ts`
  - `.route("/subscription-plans", subscriptionPlansRoutes)`
- `packages/core/src/auth/platform-permissions.ts`
  - Add `subscriptionPlans: ["list", "manage"]` to `platformStatement`.
  - Grant `list` + `manage` to `platformAdminRole`; grant `list` only to
    `platformSupportRole` (read-only oversight, same pattern as `user`/`organization`).
- `apps/api/src/modules/billing/stripe-billing.service.ts`
  - Look up plan config via `subscription-plans.service.ts`'s resolver instead of the
    hardcoded map.
  - Validate `providerPriceId` exists and the plan `isActive` before creating a Stripe
    Checkout session.
  - Implement `validatePriceId(priceId)` via `stripe.prices.retrieve(priceId)` —
    returns `{ active: price.active, recurring: price.recurring !== null }`, or throws
    `AppError("VALIDATION_ERROR", ...)` if Stripe returns a 404/invalid-id error. Called
    from `subscription-plans.service.ts` on every `POST`/`PATCH` that sets or changes
    `providerPriceId` — this is the check that catches a typo'd or non-recurring price
    id at admin-save time instead of at a real customer's checkout attempt.
- `apps/api/src/modules/billing/billing.schema.ts`
  - Change `planId` from enums to `z.string()`.
- `apps/api/src/modules/billing/billing.handlers.ts`
  - Store `planId` string on billing rows (no DB type change needed).
- `apps/api/src/modules/billing/organization-billing.db.ts` and
  `individual-billing.db.ts`
  - Change `plan` field type from typed union to `string`.
- `apps/api/src/middleware/entitlement.middleware.ts`
  - Resolve `PlanEntitlements` via `subscription-plans.service.ts`'s
    `resolveEntitlementsForPlan` (in-process call, not HTTP) before calling
    `canAccessFeature`/`getPlanLimit`. Doesn't itself distinguish missing-row from
    DB-error — that split lives in `resolveEntitlementsForPlan` (item 3) so both
    callers (this middleware and `seat-limit.middleware.ts`) get the same behavior for
    free instead of re-implementing it twice.
- `apps/api/src/middleware/seat-limit.middleware.ts`
  - Resolve `seatLimit` the same way, from the DB plan row.

### 4. Admin UI (`apps/admin`)

- New feature directory `apps/admin/src/features/subscription-plans/`
  - `api/types.ts` — plan shape, list filters, create/update payloads
  - `api/service.ts` — `apiFetch` calls to `/subscription-plans`
  - `api/queries.ts` / `api/mutations.ts` — TanStack Query wrappers
  - `schemas/subscription-plan.ts` — Zod form schemas
  - `components/subscription-plan-listing.tsx` — table of plans
  - `components/subscription-plan-form-sheet.tsx` — create/edit sheet with an optional
    "Organization" picker to make the plan private/custom. When editing a plan whose
    `activeSubscriberCount > 0` and the admin changes `providerPriceId`, shows a warning
    banner ("N active subscription(s) on this plan won't be affected by this price
    change") — surfaces item 5 in the UI instead of leaving it as a doc-only note.
    Attempting to deactivate the current default plan, or to set `isActive: false`/clear
    `isDefault` with no other default candidate, shows the server's `VALIDATION_ERROR`
    message inline rather than a generic failure toast.
  - `components/subscription-plan-table/columns.tsx` — TanStack Table columns showing
    public vs custom badge, active/inactive, default badge
  - `components/subscription-plan-table/cell-action.tsx` — edit + activate/deactivate
    row actions (no delete action, per "No hard delete")
- New page `apps/admin/src/app/dashboard/subscription-plans/page.tsx`
  - Wrapped in `PlatformAccessGate` (admin/support visibility; edit actions additionally
    check `manage` permission client-side, same UX-only convenience `PlatformAccessGate`
    already documents — the real gate is server-side).
- `apps/admin/src/config/nav-config.ts`
  - Add "Subscription Plans" nav item under Overview.

### 5. Tests

- `apps/api/src/modules/subscription-plans/subscription-plans.integration.test.ts` (new)
  - Platform admin can CRUD (create/update) plans; support role can list but not
    create/update; regular user gets 403.
  - Invalid feature/limit keys are rejected at the write boundary.
  - Two different organizations can each create a custom plan with the same `planId`
    slug without colliding (proves the corrected unique index).
  - Creating a second default shared plan for the same `ownerType` reassigns/rejects
    per the invariant, never silently allows two.
  - Saving a plan with a nonexistent/inactive/non-recurring `providerPriceId` is
    rejected (mock `billingService.validatePriceId` for this — no real Stripe call in
    tests, same reasoning `billing.integration.test.ts` already applies to Stripe
    calls it can't make unconditionally in CI).
  - Deactivating the current default plan, or clearing its `isDefault` with no other
    default candidate, is rejected with `VALIDATION_ERROR` — including the edge case of
    deactivating the _last_ active shared plan for an `ownerType` even when it isn't
    currently flagged `isDefault` (the vacuous-truth case item 6 specifically covers).
  - A billing row on a _deactivated_ (`isActive: false`) plan still resolves its real
    entitlements normally — proves deactivation is never mistaken for "row doesn't
    exist" (the second contradiction this doc used to have between item 3 and the
    deactivation walkthrough).
  - `GET /:ownerType/:planId` includes an accurate `activeSubscriberCount` for a plan
    with real billing rows on it.
  - A DB error during `resolveEntitlementsForPlan` propagates (asserted via a route
    that forces the DB call to throw) rather than silently returning
    `fallbackEntitlements` — proves item 3's fail-loud/fallback split is real, not just
    documented.
- `packages/core`: unit test `resolvePlanEntitlements` — unknown keys dropped, missing
  known keys default correctly, matches `PlanEntitlements`'s closed shape.
- Update `billing.integration.test.ts` / `individual-billing.integration.test.ts` if the
  checkout/plan lookup paths change.
- Update `entitlement.integration.test.ts` to use seeded DB plans instead of the
  hardcoded map; add a case for the `fallbackEntitlements` path (plan row missing).
- Optional: `apps/admin` component tests for the plan form sheet (follow
  `sign-in-view.test.tsx` patterns).

### 6. Documentation

- `AGENTS.md` — update the Billing model and Feature Entitlements sections to reflect
  DB-backed plans, the DIP guardrail (`packages/core` never resolves a plan by id
  itself), and the read-side key-revalidation rule.
- `CHANGELOG.md` — add an entry under `Added` for the admin-managed subscription plan
  catalog.
- `ENTITLEMENTS.md` — update design rationale: why plan ids widened to `string`, what
  replaced the compile-time exhaustiveness guarantee (`resolvePlanEntitlements` +
  `fallbackEntitlements`), why there's still no third-party feature-flag service.

## Admin UX flow

What this actually looks like day-to-day from `/dashboard/subscription-plans`, once
built:

### Viewing the catalog

The list page shows every plan across both `ownerType`s (filterable), each row: name,
`ownerType` badge, shared/custom badge (custom shows the org it belongs to, linking to
`/dashboard/organizations/[id]`), seat limit (organization plans only), active/inactive
badge, default badge, and how many live subscribers are on it. `support`-role accounts
see this exact same view read-only — no edit/create controls render for them
(`manage`-gated, server-enforced regardless of what the UI shows).

### Creating a new shared plan (e.g. a fourth organization tier)

1. Click "New Plan" → the sheet opens with no organization selected (shared plan by
   default).
2. Fill in `planId` (slug), name, description, seat limit, and a Stripe Price ID.
3. Toggle features on/off from the fixed, known list (`FeatureKey`s) — there's no "add
   a feature" text box; the catalog of togglable things is closed by design.
4. Set numeric limits for each known `PlanLimitKey`.
5. Submit. Server-side: the Stripe price is verified live before the row is saved — if
   it's a typo or points at a one-time (non-recurring) price, the sheet shows that
   error inline, nothing is persisted. On success, the new plan appears in the list
   immediately, `isActive: true`, `isDefault: false`.

### Creating a custom plan for one organization (an enterprise deal)

1. Click "New Plan" → this time pick an organization from the picker. The sheet now
   frames itself as a custom plan for that org.
2. Same feature/limit toggles, but nothing stops reusing a `planId` slug already used
   by a shared plan or another org's custom plan — the corrected unique index scopes
   uniqueness per-organization, exactly for this case.
3. Paste in the Stripe Price ID negotiated for this customer (still validated live).
4. Submit. This plan never appears as an option for any other organization's checkout —
   it's assigned directly, out of band (how that assignment happens on the billing side
   is existing `organization_billing` behavior, unchanged by this feature).

### Editing an existing plan

1. Open a plan from the list → the same sheet, pre-filled.
2. Toggling a feature or changing a limit and saving takes effect immediately for
   every current subscriber on that plan — there's no "are you sure" step beyond the
   normal save, since this is a stated, accepted v1 behavior (item 4), not a bug.
3. Changing the Stripe Price ID on a plan with active subscribers shows a banner first
   — "N active subscription(s) on this plan won't be affected by this price change" —
   so it's clear this only changes what _new_ checkouts use.

### Deactivating a plan

1. Row action → "Deactivate." This flips `isActive: false`; existing subscribers are
   completely unaffected (their billing row still references this plan id, entitlement
   resolution still works the same), it only disappears as an option for new checkouts.
2. If this is currently the default plan for its `ownerType`, the action is blocked
   with an inline explanation — assign a different default first (see below), then
   deactivating the old one succeeds.

### Changing the default plan (which new signups with no billing row resolve to)

1. Row action → "Set as default" on the plan that should become the new default.
2. Server-side, this is one transaction: unset the old default, set the new one. A
   concurrent attempt to do this from two admin sessions at once fails one of them
   cleanly (partial unique index, item 2) rather than leaving two defaults or silently
   picking one.

## Verification

1. `pnpm db:generate` produces only the expected migration for the new table.
2. `pnpm db:migrate` applies the migration and seeds the five default plans on the dev
   DB.
3. `pnpm --filter @repo/api typecheck` and `pnpm --filter @repo/core typecheck` pass.
4. `pnpm --filter @repo/admin typecheck` and `pnpm --filter @repo/admin build` pass.
5. `pnpm --filter @repo/api test` passes (existing + new integration tests).
6. Manual end-to-end: admin creates a shared plan with a feature, a gated route
   respects it, checkout uses the plan's Stripe price ID. Admin creates a custom org
   plan (reusing an existing shared plan's slug on purpose, to prove the index fix),
   assigns it, and that org's checkout uses the custom price.

## Out of scope

- Changing Stripe product/tier structure (still one plan ↔ one Stripe price).
- Automated Stripe Product/Price creation from the admin UI (custom plans use a
  manually entered Stripe price ID for now).
- A public/unauthenticated pricing-page route (see "Internal resolution never goes
  through the HTTP route" — no real caller needs this yet).
- Plan versioning or grandfathering existing subscriptions — item 4 (editing a plan is
  immediately live for current subscribers) is accepted as-is for v1; a customer-facing
  "what plan did I sign up under" history is real, separate future work.
- **Self-service upgrade/downgrade or cancellation (Customer Portal).** Stripe's own
  recommended pairing for a plan catalog is Checkout (new subscriptions) + Customer
  Portal (changes/cancellation) — this feature only builds the catalog + admin CRUD +
  initial checkout, not the portal. Named explicitly here so it's a known gap, not a
  silent omission.
- **Reusing a `planId` slug for the same organization's _next_ custom plan after
  retiring the previous one.** Because there's no hard delete, the old (now inactive)
  row still occupies that `(ownerType, planId, organizationId)` slot. Accepted
  friction — the admin picks a fresh slug (e.g. `enterprise-2026`) for a renegotiation;
  not worth relaxing the uniqueness constraint for.
- **Stripe Dashboard-side subscription changes reflecting back into our `plan`
  string.** Pre-existing, not introduced by this change: `subscription_updated`
  webhooks only carry `status` and `seatQuantity` (`BillingEvent`'s existing shape),
  not a plan id — a price changed directly in the Stripe Dashboard (bypassing our
  checkout) never updates `organization_billing.plan`/`individual_billing.plan`. Worth
  tracking as a follow-up now that plans carry real feature/limit data, not just a
  label, but out of scope for this change.
- Usage-based billing or per-seat pricing beyond the existing `seatLimit` model.
- Webhook-driven plan sync from Stripe.
- Hard-deleting a plan (see "No hard delete").
