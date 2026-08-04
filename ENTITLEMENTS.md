# Feature entitlements — design

How this repo gates a route or capability behind a subscription plan, for both billing
universes (organization and individual — see `AGENTS.md`'s Billing model section). This
is the design record; the compressed rules a coding agent must follow live in
`AGENTS.md`'s "Feature Entitlements" section — read that one first if you just need the
rules, come back here for the reasoning.

## Why in-house, not a third-party package

No external feature-flag service (LaunchDarkly, Flagsmith, Unleash, GrowthBook, Stripe
Entitlements) is used here, on purpose:

- **Zero cost, zero new dependency.** The plan→entitlement mapping is a static config
  object, not something that needs a runtime service, a database of its own, or a
  network call per check.
- **It already fits the existing pattern.** `organizationPlans`/`individualPlans`
  (`packages/core/src/billing/types.ts`) already are a plan→config map with the comment
  "a real product replaces these with its own tiers/limits" — entitlements are the same
  shape of problem (plan→something), solved the same way.
- **A real feature-flag service solves a different problem** — runtime toggles
  independent of billing (gradual rollouts, kill-switches, A/B tests). Reach for one of
  those _in addition to_ this system if that need shows up later; it's not a replacement
  for plan-based gating.

## The problem the naive version gets wrong

A first-pass design (single `PlanEntitlements` config, one middleware reading
`c.get('organization')`) breaks the moment an individual (B2C) user hits a gated route —
there is no organization to read, so the check either throws for every individual or
silently passes everyone through. This repo has **two separate plan universes**
(`OrganizationPlanId`: `free`/`starter`/`growth`, `IndividualPlanId`:
`individual_free`/`individual_pro`) with different plan ids and different config shapes
— any entitlement design has to be built for both from the start, not generalized to
individual billing after the fact.

## Design

### Domain layer — `packages/core/src/billing/entitlements.ts`

**Superseded design note (as of the admin-editable plan catalog, see
`specs/subscription-management-plan.md`):** the two paragraphs below describing
`organizationPlanEntitlements`/`individualPlanEntitlements` and `BillingOwner` describe
the _original_ design and no longer match the code — kept here for history, corrected
inline. Plans (including their entitlements) are now rows in `packages/db`'s
`subscriptionPlans` table, admin-editable from `apps/admin`, not a hardcoded map keyed
by a closed `OrganizationPlanId`/`IndividualPlanId` union (those two types are now
`string` aliases — see the spec's "Preserving the typed guarantee at runtime" section
for what replaced the compile-time exhaustiveness guarantee this section originally
described).

- `FeatureKey` — boolean feature flags (illustrative set for this foundation). **This
  one part is unchanged and must never move to the database** — it's the closed
  vocabulary that makes "admin-editable plans, still typed" possible at all.
- `PlanLimitKey` — numeric caps (e.g. `maxProjects`). Also unchanged, same reasoning.
- `featureKeys` / `limitKeys` — runtime companions to the two type unions above,
  derived from a `Record<FeatureKey, true>`/`Record<PlanLimitKey, true>` registry so an
  omitted key is a `tsc` error, not a silent gap. What `subscription-plans.schema.ts`'s
  `z.enum(featureKeys)`/`z.enum(limitKeys)` validate plan writes against, and what the
  admin UI's plan form iterates over to render one toggle/number-field per known key.
- `PlanEntitlements` — `{ features: Record<FeatureKey, boolean>; limits:
Record<PlanLimitKey, number> }`. Unchanged shape.
- `resolvePlanEntitlements(raw)` — pure normalizer, **replaces**
  `organizationPlanEntitlements`/`individualPlanEntitlements`. Re-validates a plan row's
  raw JSONB `features`/`limits` against `featureKeys`/`limitKeys` on every read (not
  just at the write boundary): unknown keys dropped, missing known keys default to
  `false`/`0`. This is what keeps `PlanEntitlements` exactly as closed as it was when it
  came from a compiled map — only the _source_ of the raw data changed.
- `fallbackEntitlements` — one small deny-most constant, used only when a plan row
  genuinely doesn't exist at all (a seed/data gap) — never for a merely-deactivated plan
  (which still resolves its real entitlements) and never for a DB error (which must
  propagate, not fall back — see the spec's item 3).
- `canAccessFeature(entitlements, feature)` / `getPlanLimit(entitlements, limit)` — pure
  functions, no DB/HTTP, **now take an already-resolved `PlanEntitlements` directly**
  instead of a `BillingOwner`. `BillingOwner` is gone — resolving a plan row (via
  `apps/api`'s `subscription-plans.service.ts`, which knows how to look up a custom vs.
  shared plan for an org) and normalizing it (`resolvePlanEntitlements`) both now happen
  before these are ever called.

### Application layer — `apps/api/src/middleware/entitlement.middleware.ts`

One middleware, `requireFeature(feature, scope)`, for the whole app — not two separate
org/individual middlewares, and not one that infers which billing entity to check. Two
deliberate choices worth calling out:

**1. `scope` is a required argument, never inferred from `userContext.mode`.**

The tempting shortcut: branch on `userContext.mode` the way `requirePermission` and
`enforceSeatLimit` already do (B2B2C → org logic, B2C → pass-through/individual logic).
That shortcut is wrong here specifically because entitlements — unlike permissions and
seat limits — are a real, separate concept on **both** sides. `requirePermission`/
`enforceSeatLimit` can treat B2C as "pass through" because there's nothing on the
individual side for them to check (no org role, no seat concept). Entitlements don't
have that luxury: an individual has their own plan and their own entitlements too.

If `scope` were inferred from session mode instead of declared by the route, a route
gating a **personal** feature (e.g. a user's own AI usage cap) would silently check the
**organization's** entitlements for any B2B2C session that happens to have an org
active — wrong plan, wrong owner, and a real access-control bug in either direction
(wrongly grants access an org's high tier shouldn't unlock for an individual's low tier,
or wrongly denies access an individual's own paid plan should unlock). Requiring the
route author to state `scope` explicitly closes off that entire bug class at the type
level — every call site has to decide, so there's no ambiguous default to get wrong.
Proven directly in `entitlement.integration.test.ts`'s "works for a B2B2C session too"
case: a route declared `scope: "individual"` ignores the caller's active organization
entirely, by construction.

**2. Denial reuses the existing `PAYMENT_REQUIRED` error code, not a new one.**

`packages/core/src/errors.ts`'s `ErrorCode` is a closed union — `AGENTS.md` is explicit
that a new failure case gets a new code added there, never a bespoke string thrown
ad hoc. `PAYMENT_REQUIRED` (402) already exists and already means exactly this ("your
current plan doesn't cover this") — `enforceSeatLimit` throws it for the same class of
problem (a plan limit). Reusing it keeps the two plan-gate failure modes in this app
indistinguishable at the protocol level on purpose: a client only needs to handle
"upgrade required," not learn a second code that means the same thing.

**3. Missing org context (`scope: "organization"` with no active org) is a distinct
error from "plan too low."**

Reuses `requireOrgContext` (`middleware/auth.middleware.ts`), which throws
`VALIDATION_ERROR` — "this action requires an active organization" is a different
problem than "your plan doesn't include this," and collapsing them into one error would
make the client's error handling worse, not simpler.

### Resolving the current plan

Both branches fetch the owner's billing row through the existing RLS-respecting
helpers — `withOrgScope`/`getBillingByOrgId` and `withUserScope`/`getUserBillingByUserId`
— never the bare `db` client, per `AGENTS.md`'s Row-Level Security rules. No billing row
yet resolves via `subscription-plans.service.ts`'s `getDefaultPlanId(ownerType)` — the
current `isDefault: true` shared plan for that ownerType, **not** a hardcoded
`"free"`/`"individual_free"` string anymore (that literal is now only a last-resort
fallback inside `getDefaultPlanId` itself, for the data-integrity edge case where no
plan is flagged default at all). A new signup with no billing row yet is not an error
case, it's whatever plan an admin has configured as the default tier. The resolved
`planId` string then goes through `resolveEntitlementsForPlan(ownerType, planId, organizationId)`
(same file), which looks up the actual plan row — checking a custom org-scoped plan
before falling back to the shared one, since a billing row's `plan` string alone can't
disambiguate which — and normalizes it via `resolvePlanEntitlements` before
`canAccessFeature`/`getPlanLimit` ever see it.

### Wiring a route

```ts
.get(
  "/some-premium-feature",
  injectUserContext,
  requireFeature("advanced_analytics", "organization"), // or "individual"
  async (c) => { /* one call, per AGENTS.md's route handler discipline */ },
)
```

No permanent route in this repo uses `requireFeature` yet — there's no real
subscription-gated feature built here to attach it to (`AGENTS.md`'s "don't scaffold
ahead of the task" rule: this repo was previously over-scaffolded once already).
`entitlement.integration.test.ts` proves the middleware itself against a test-only route
mounted on a standalone `Hono` instance instead of inventing a placeholder feature
module (`ai.routes.ts`, `student-progress.routes.ts`) just to have somewhere to attach
it.

## Deviations from a naive spec, and why

If you've seen a spec for this that says "create `packages/core/src/billing/plans.ts`",
"`c.get('organization')`", "`PLAN_UPGRADE_REQUIRED`", or "wire this into `ai.routes.ts`"
— those don't match what's actually in this repo, on purpose:

- **No `plans.ts`.** `OrganizationPlanId`/`IndividualPlanId`/`organizationPlans`/
  `individualPlans` already exist in `billing/types.ts` — a second, competing plan file
  would duplicate a shape that's already the source of truth (`AGENTS.md`: "check
  `@repo/core` for an existing shape before declaring a new type").
- **No `permissions.ts` name for the pure helpers.** `packages/core/src/auth/
permissions.ts` already means something specific and different here (RBAC — what an
  org role can do). Naming a second, unrelated file the same thing invites confusing the
  two authorization concepts. The pure helpers live in `entitlements.ts` instead.
- **No `c.get('organization')`.** This app's context variable is `userContext`
  (`middleware/auth.middleware.ts`'s `UserContext` discriminated union on `mode: 'B2C' |
'B2B2C'`) — there's no separate `organization` context variable, and reading one would
  be a silent runtime `undefined`.
- **No new `PLAN_UPGRADE_REQUIRED` error code.** See above — `PAYMENT_REQUIRED` already
  covers this, and `ErrorCode` is a closed, deliberately small union.
- **No `ai.routes.ts`/`student-progress.routes.ts`.** Neither exists in this repo; both
  are named in `PROGRESS.md` only as future, unbuilt stubs. Creating either just to
  demonstrate a middleware would be exactly the kind of ahead-of-task scaffolding
  `AGENTS.md` calls out as this repo's one prior mistake.

## Verified

`apps/api/src/middleware/entitlement.integration.test.ts`, 6 tests against the real
server/DB/session (no mocking): organization scope blocks on the default free plan and
allows after an upgrade to a plan with the feature; organization scope rejects distinctly
(422, not 402) when there's no active organization at all; individual scope blocks on
the default `individual_free` plan and allows after an upgrade; and the loophole check —
individual scope ignores an active organization entirely, proving `scope` isn't silently
falling back to mode-based inference.
