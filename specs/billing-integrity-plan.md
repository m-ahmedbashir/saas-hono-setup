# Billing Integrity — Immutable Ledger, Idempotency & Invoice Records Plan

## Objective

This repo's Stripe integration works for the happy path but has no memory, no
duplicate-request protection, and no customer-facing record of what was actually
purchased. Three concrete production gaps, all verified against the actual code (not
assumed):

1. **No event history.** `organization_billing`/`individual_billing` are pure
   current-state snapshots — every webhook `UPDATE`s the same row. There is no record of
   _what happened_, only _what's true right now_. You cannot answer "when did this go
   past_due," "was this ever refunded," or "how many payment attempts failed" — none of
   that exists, anywhere, today.
2. **No idempotency, at either end of the flow.** Outbound (creating a Stripe Checkout
   Session) and inbound (receiving a webhook) are each vulnerable to duplicate processing
   in ways a slow network or a retry can trigger for real. Details below.
3. **No order/receipt record.** There is nowhere a customer's actual purchase history
   lives — no "you bought Starter on this date for this amount, here's your receipt."
   This is distinct from #1: the event ledger is a system-level audit trail of raw Stripe
   payloads; what's missing here is a curated, business-meaningful `invoices` table a
   "billing history" page could actually query and paginate, with a real receipt link.

This is `apps/api`-only — independent of `apps/portal` (`specs/customer-portal-plan.md`),
though the portal's billing routes should be built to write through this ledger once it
exists, not around it. Scoped separately on purpose so it isn't rushed alongside a
frontend build.

## Current state, verified

### Event coverage

`stripe-billing.service.ts`'s `parseWebhookEvent` only maps three Stripe event types:
`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.
Every other event type Stripe sends hits `default: return null` — silently dropped, not
logged, not stored. That includes the events that actually matter for a real subscription
business:

- `invoice.paid` — a renewal was actually charged and money moved. Today there is **no
  signal for this at all** — the only proxy is the subscription object's `status` staying
  `active`, which tells you nothing about _when_ a charge happened or _how much_.
- `invoice.payment_failed` — the real, timely first sign of trouble. Right now the system
  only reacts once Stripe's own retry schedule eventually flips the subscription to
  `past_due` via `customer.subscription.updated` — later and less precise than reacting
  to the failed invoice directly.
- `charge.refunded` — refunds are **completely invisible** to this system. Issue one from
  the Stripe dashboard today and nothing here ever knows it happened.
- `charge.dispute.created` — chargebacks, also invisible.

### Outbound idempotency (checkout creation)

The plumbing already exists, and is already dead: `billing.controller.ts` reads an
optional `Idempotency-Key` request header and threads it through
`billing.service.ts` → `stripe-billing.service.ts`'s `checkout.sessions.create(..., idempotencyKey ? {...} : undefined)`.
**Nothing anywhere in this codebase currently sends that header** — `apps/admin` has no
checkout UI at all (staff-only app), and there's no portal yet. So today, the moment a
real "Subscribe" button exists, a double-click or a client-side retry after a slow
response would create **two separate Stripe Checkout Sessions** for the same intent, with
zero protection, despite the backend already being capable of preventing it.

(To be precise about the actual risk: creating two sessions isn't itself a double charge
— a Checkout Session is a one-time-use hosted page, and Stripe won't let the same session
be completed twice. The real risk is a confused user completing _two different_ session
URLs — e.g., a retry silently opened a second tab — resulting in two active subscriptions
and two real charges.)

### Inbound idempotency (webhook processing)

Stripe delivers webhooks **at least once** — retries on timeout, non-2xx response, or
transient failure are expected, normal Stripe behavior, not an edge case. `processWebhook`
never checks the event's own Stripe ID (`evt_...`) before processing. State-only writes
are harmless to repeat (an `UPDATE ... SET status = 'past_due'` run twice is still just
`past_due`), but the _side effect_ isn't: `billing.handlers.ts`'s `notifyStaffOfBillingIssue`
would re-fire a duplicate staff notification on every retried delivery of the same event.

## The fix: one append-only ledger, two idempotency guards

### New table: `billing_events`

```
id                 text primary key
stripe_event_id    text not null unique   -- Stripe's own evt_... id — the idempotency guard
type               text not null          -- e.g. "invoice.paid", "charge.refunded"
owner_type         text                   -- "organization" | "individual" | null (unresolvable yet)
owner_id           text                   -- organizationId or userId, null if unresolvable
event_created_at   timestamp not null     -- Stripe's own `created` field on the event — logical
                                           -- order, not arrival order. This is the field the
                                           -- out-of-order-delivery guard below actually compares
                                           -- against; see "Status must be derived from event
                                           -- order, not arrival order."
payload            jsonb not null         -- the raw Stripe event, verbatim
received_at        timestamp not null default now()  -- when *we* got it — kept distinct from
                                           -- event_created_at on purpose, never used for ordering
```

Never `UPDATE`d, never `DELETE`d. Not RLS-scoped (same reasoning as `subscription_plans` —
this is a system-populated ledger, not per-org application data with a live session to
scope against; the webhook handler already runs under `withSystemScope`). At the Postgres
level, `REVOKE UPDATE, DELETE ON billing_events FROM app_user` — the same restricted role
this repo already uses for RLS enforcement — so immutability holds even against a future
application bug, not just by convention.

### New table: `invoices` (the receipt/order record)

A curated, one-row-per-real-transaction table — what a "billing history" page and a
"download receipt" button actually read from, as opposed to `billing_events`' raw JSONB
dump. Derived from `invoice.paid`/`charge.refunded` specifically, not every event type:

```
id                        text primary key
owner_type                text not null            -- "organization" | "individual"
organization_id           text references organization(id)   -- null for individual
user_id                   text references user(id)           -- the individual owner, or the org's owner for record-keeping
plan_id                   text not null            -- snapshot at purchase time — NOT a live FK to subscription_plans,
                                                    -- since a plan can be edited/deactivated later and a receipt must
                                                    -- keep reflecting what was actually true when the money moved
amount_total              integer not null         -- in cents, matches Stripe's own integer-cents convention
currency                  text not null
status                    text not null            -- "paid" | "refunded" | "partially_refunded"
stripe_invoice_id         text unique
stripe_charge_id          text unique
provider_subscription_id  text not null
receipt_url               text                     -- Stripe's own hosted receipt URL — no reason to build a PDF
                                                    -- generator when Stripe already hosts one per charge
issued_at                 timestamp not null        -- the real transaction date, taken from the Stripe payload —
                                                    -- not this row's insert time, which may lag behind it
created_at                timestamp not null default now()
```

Populated inside the **same transaction** as the `billing_events` insert, when the event
type is `invoice.paid` (insert a new `paid` row) or `charge.refunded` (update the matching
row's `status` by `stripe_charge_id` — the one place in this plan an existing row _is_
mutated, since "this specific invoice was refunded" is itself new information about that
transaction, not a rewrite of history; the original `paid` fact and its `billing_events`
entry are never touched). Not RLS-scoped for the same system-populated reasoning as
`billing_events`; who gets to _read_ it (staff via `apps/admin`, the owning
customer via `apps/portal`, or both) is a routes-and-permissions decision for whichever
plan builds that UI, not this one.

### Fix 1 — inbound idempotency via the ledger itself

`processWebhook` inserts the raw event into `billing_events` **first**, inside the same
transaction as any state update, using `stripe_event_id`'s unique constraint as the guard:
insert fails on conflict → this exact event was already processed → skip the rest of
`handleBillingEvent` and acknowledge 200 immediately. No separate "have I seen this"
lookup query needed; the constraint does the work.

### Fix 2 — outbound idempotency, actually wired up

The backend capability already exists (see above) — what's missing is a caller. Whichever
frontend builds the first real "Subscribe" button (`apps/portal`, per
`specs/customer-portal-plan.md`) must generate a stable key **per logical checkout
attempt** and send it as `Idempotency-Key`. Concretely: a `crypto.randomUUID()` created
**once**, in component state (`useState(() => crypto.randomUUID())` or an equivalent
one-time initializer — never inline in the render body or inside the click handler
itself, either of which would mint a fresh key on every call and silently defeat the
whole protection), reused across every click/retry of that same checkout attempt, and
only regenerated when the user genuinely starts a new attempt (changes plan selection, or
the previous attempt completed/was abandoned and they're subscribing again).

**Deliberately not a deterministic key** (e.g., a hash of `orgId + planId`) despite that
being a tempting alternative — a purely input-derived key with no per-attempt randomness
would collide with itself for a _legitimately new_ purchase of the same plan much later
(e.g., resubscribing after canceling months ago), incorrectly telling Stripe "this is the
same request" and returning a stale, long-expired session instead of creating a real new
one. The randomness has to scope the key to _this one attempt_, not to the (org, plan)
pair forever.

Stripe's own semantics then do the rest: the same key + same params returns the original
session instead of creating a new one; the same key with _different_ params is rejected
as a conflict, which is the correct failure mode (it means something changed between
attempts and blindly reusing the cached result would be wrong).

### Expanded event coverage

Add `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`
to `parseWebhookEvent`'s mapped `BillingEvent` union. Each still gets its own row in
`billing_events` regardless of whether `handleBillingEvent` does anything else with it —
recording the event is unconditional; reacting to it (e.g., a new "refund issued"
notification, mirroring the existing payment-failed trigger) is a separate, later decision
per event type, not bundled into this plan.

### Fix 3 — status must be derived from event order, not arrival order

Stripe's webhook delivery is at-least-once, but it is **not** ordered — a
`customer.subscription.updated` and the `invoice.paid` for the same renewal can arrive at
this endpoint in either order, and a delayed retry of an _older_ event can land after a
_newer_ one has already been applied. Blindly overwriting the current-state row with
"whatever arrived last" (today's actual behavior — every `update*BySubscriptionId` call in
`billing.handlers.ts` is an unconditional `UPDATE`) risks the displayed status regressing
backward in time: e.g., a late-arriving retry of an old `past_due` event overwriting a
row that a more recent `active` event had already corrected.

Fix: every current-state update becomes conditional on `event_created_at`, not just an
unconditional write. `organization_billing`/`individual_billing` each gain a
`last_event_at timestamp` column; `updateBillingBySubscriptionId`/
`updateUserBillingBySubscriptionId` add `AND (last_event_at IS NULL OR last_event_at < $eventCreatedAt)`
to their existing `WHERE providerSubscriptionId = ...` clause, and set
`last_event_at = $eventCreatedAt` alongside whatever else they update. An out-of-order
event's `UPDATE` then matches zero rows — a real no-op, not a mistaken overwrite — while
its `billing_events` ledger row is still recorded regardless (the ledger is
unconditional; only the current-state _projection_ update is order-guarded). This is a
plain conditional `UPDATE ... WHERE`, not a stored procedure or a `GREATEST()` expression
on the status column itself — status values ("active"/"past_due"/"canceled") have no
natural ordering to take a max of; _time_ does, and time is what actually decides which
update should win.

### Fix 4 — a refund arriving before its invoice must not be silently dropped

`charge.refunded` updates the matching `invoices` row by `stripe_charge_id` — but if
`invoice.paid` for that same charge hasn't been processed yet (delivery order isn't
guaranteed, see Fix 3), there is no row to update yet. Silently no-op-ing here would
**permanently lose the refund** from the curated `invoices` table the moment this race
happens, even though the raw event is still safely sitting in `billing_events`.

Fix: when `charge.refunded` finds no matching `invoices` row, **throw** rather than
swallow it — inside the _same_ `withSystemScope` call `handleBillingEvent` already wraps
every other event type in (not a second, separate transaction), so the whole thing,
ledger insert included, rolls back together. Stripe's own retry/backoff schedule
(documented to retry a failing endpoint for up to three days) then redelivers the same
event later, by which point `invoice.paid` has normally already landed and the update
finds its row.

**Observability — this expected, self-healing condition must not page anyone.**
`apps/api/src/instrument.ts` has real Sentry wired in (gated on `SENTRY_DSN`, currently a
no-op if unset but real once configured). A thrown "invoice not found yet" propagating
through `app.onError` unmodified would be auto-captured by Sentry identically to a
genuine bug — this is _expected backpressure_, not an incident, and shouldn't look like
one on a dashboard someone is paged from. Don't solve this by inventing a new `AppError`
code across the shared error contract (`apps/admin/src/lib/api-client.ts`'s `ErrorCode`
union and friends) just for this one internal case — that's a bigger footprint than the
problem deserves. Instead: log a distinct, greppable line (e.g.
`"billing: charge.refunded arrived before its invoice — will retry"`) at `warn`, not
`error`, immediately before the throw, so it stays visible for debugging without reading
as a 500-level incident; whatever alerting rule watches error rates should key off
severity/log pattern, not merely "an exception was thrown."

## Architecture notes

- `organization_billing`/`individual_billing` **don't go away** — they remain the fast
  "current state" read path most queries actually want. The ledger becomes the source of
  truth; the current-state tables become a projection derived from it, kept in sync in
  the same transaction as the ledger insert (not a separate reconciliation step for v1).
- `packages/core`'s `BillingEvent` type (`packages/core/src/billing/types.ts`) grows new
  variants for the added event types — same DIP boundary as today: `packages/core` only
  ever describes the normalized shape, `apps/api`'s `stripe-billing.service.ts` remains
  the only file that imports the `stripe` package.
- A natural (but explicitly out-of-scope-for-this-plan) extension once this lands: the
  portal's billing page reading `invoices` for a real "billing history" view (one row per
  card = one `<InvoiceRow>`, `receipt_url` as the "Download receipt" link — no curation
  logic needed client-side, the table is already the curated shape), and a periodic
  reconciliation job against Stripe's own List Events API to catch anything missed beyond
  Stripe's retry window. Both are genuine next steps, not part of this plan — noted so
  they're not forgotten, not so they're built now.

## Required work

1. **Migration**: new `billing_events` and `invoices` tables, `last_event_at timestamp`
   added to `organization_billing`/`individual_billing`, + the `REVOKE UPDATE, DELETE`
   grant change on `billing_events` (custom SQL migration, same pattern as the RLS
   migrations already in `packages/db/migrations/`). `invoices` keeps normal `app_user`
   grants — its one legitimate mutation (marking a row refunded) is a real, intentional
   update, not a bug to guard against.
2. **`packages/core/src/billing/types.ts`**: extend `BillingEvent` with `invoice_paid`,
   `invoice_payment_failed`, `charge_refunded`, `charge_dispute_created` variants, each
   carrying the event's own `eventCreatedAt` (Stripe's `created` field) alongside whatever
   fields that event type needs.
3. **`stripe-billing.service.ts`**: map the four new Stripe event types in
   `parseWebhookEvent`, pulling `amount_total`/`currency`/`receipt_url`/`eventCreatedAt`/
   etc. off the raw Stripe payload into the normalized `BillingEvent` shape.
4. **`organization-billing.db.ts`/`individual-billing.db.ts`**: `updateBillingBySubscriptionId`/
   `updateUserBillingBySubscriptionId` gain the `last_event_at`-guarded `WHERE` clause
   from Fix 3 — every caller now passes the event's `eventCreatedAt` alongside whatever
   else it updates.
5. **`billing.handlers.ts`**: insert into `billing_events` first (idempotency guard), then
   on `invoice_paid` insert an `invoices` row / on `charge_refunded` update the matching
   one by `stripe_charge_id` — throwing (Fix 4), not swallowing, if no matching row exists
   yet — all inside the same transaction; existing `checkout_completed`/
   `subscription_updated`/`subscription_canceled` branches now pass `eventCreatedAt`
   through to the `.db.ts` calls per Fix 3, otherwise unchanged.
6. **`packages/db`**: new `billing-events.ts` (`insertBillingEvent`) and `invoices.ts`
   (`insertInvoice`, `markInvoiceRefunded` — throws if no row matched) — mirrors
   `notifications.ts`'s existing `insertNotification` shape/reasoning.

## Testing Strategy

Integration tests in the existing style (`billing.integration.test.ts`'s pattern):

- Sending the **same** signed webhook payload twice results in exactly one
  `billing_events` row, exactly one `invoices` row (not two), and exactly one staff
  notification — the actual proof this plan is meant to deliver.
- Each of the four newly-mapped event types produces a `billing_events` row with the
  correct `type`/`payload`, independent of whether any other state changes.
- `invoice.paid` produces an `invoices` row with the correct `amount_total`/`plan_id`/
  `receipt_url`; a subsequent `charge.refunded` for the same charge updates that same
  row's `status` to `refunded` rather than creating a second one.
- **Out-of-order delivery (Fix 3)**: deliver a `subscription_updated` event with an
  _older_ `eventCreatedAt` than the row's current `last_event_at` and confirm the
  current-state row is unchanged, while its `billing_events` row is still recorded. Then
  deliver one with a _newer_ timestamp and confirm it does apply.
- **Refund-before-invoice race (Fix 4)**: send `charge.refunded` for a `stripe_charge_id`
  with no matching `invoices` row yet, confirm the request fails (propagates as a real
  error, not a silent 200), then send the corresponding `invoice.paid` followed by the
  same `charge.refunded` again and confirm it now succeeds and marks the row refunded.
- `REVOKE UPDATE, DELETE` is actually enforced on `billing_events` — attempt an
  `UPDATE`/`DELETE` through the restricted `app_user` role directly and confirm Postgres
  rejects it (same "prove it, don't trust the migration alone" discipline as the existing
  RLS tests). **This is naturally already correct in this repo's test setup, not
  something to add**: `packages/db/src/index.ts`'s exported `db` client — the same client
  every existing integration test already imports from `@repo/db` — connects via
  `APP_DATABASE_URL`, which _is_ the restricted `app_user` role (`DATABASE_URL`, the
  owner/migration role, is never used at runtime or in tests). The one thing to get
  right: write this specific test using that same `db` import like every other test does,
  not a separate raw `pg.Client` against `DATABASE_URL` for convenience — that would
  connect as the owner role instead and produce a false pass, since the `REVOKE` was
  scoped to `app_user` specifically and doesn't apply to the owner role at all.

## Boundaries

- **Always**: insert into `billing_events` before acting on any webhook event, inside the
  same transaction; guard every current-state update with `last_event_at` (Fix 3), never
  an unconditional overwrite; let a refund that can't find its invoice yet fail loudly
  (Fix 4) instead of silently dropping it; keep `packages/core`'s `BillingEvent` union as
  the only place event shapes are defined outside the Stripe adapter itself.
- **Ask first**: adding a reconciliation job (real infra decision — a cron/queue, not
  covered by this plan); exposing `billing_events`/`invoices` to any customer-facing
  route (a real product/privacy decision about what payment history a customer should
  see).
- **Never**: grant `UPDATE`/`DELETE` on `billing_events` to the app's runtime role; let
  the ledger insert be skippable/optional — every mapped event gets recorded, regardless
  of whether anything else reacts to it; let an out-of-order or racing event silently
  corrupt the current-state projection instead of being rejected/retried.

## Success Criteria

- Replaying an identical Stripe webhook payload (same `stripe-signature`, same body) a
  second time results in zero duplicate side effects — proven by an integration test, not
  just reasoned about.
- `invoice.paid`, `invoice.payment_failed`, `charge.refunded`, and `charge.dispute.created`
  each produce a durable, queryable record.
- A real checkout-creation retry (same `Idempotency-Key`, same params) returns the same
  Stripe Checkout Session URL, verified once `apps/portal` sends the header for real.
- An artificially out-of-order pair of webhook deliveries never regresses a current-state
  row's status backward in time, and a `charge.refunded` delivered before its
  `invoice.paid` is never silently lost — both proven by the Fix 3/Fix 4 tests above, not
  just reasoned about.
- `pnpm typecheck && pnpm lint && pnpm build && pnpm test` pass clean repo-wide.

## Open Questions

- Should `billing_events` also record checkout-creation _attempts_ (not just completed
  webhook events), to make abandoned checkouts visible? Left open — it's a real gap
  (there's currently zero record of a checkout that was started but never finished) but a
  distinct concern from the ledger's core "don't process the same event twice" job.
- When the portal wants a customer-facing "billing history" view, what should be
  displayed — raw events, or a curated summary derived from them? Deferred until that
  page is actually being built.
