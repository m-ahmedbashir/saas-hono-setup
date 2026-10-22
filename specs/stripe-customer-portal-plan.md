# Stripe Customer Portal — Implementation Plan

Read [specs/README.md](./README.md) first — it holds the rules every workstream follows.

## Objective

Hand subscription management to Stripe's hosted **Customer Portal** so this app stops owning
payment edge cases. Today the portal's billing page does checkout plus its own cancel button, and
changing plans means "cancel first, then buy again". After this plan, a customer with a live
subscription clicks **Manage billing** and Stripe handles:

- switching plans (with proration),
- canceling — at the end of the billing period, not immediately,
- updating the payment card, and seeing invoices,
- changing the seat count (organizations).

Our code keeps only what must be ours: starting the first purchase (Checkout), opening the
portal, and mirroring the result into our database via the webhook — because every request
checks features and seat limits locally (AGENTS.md's Billing model).

**Card data never touches our servers** — Checkout and the portal are both Stripe-hosted pages.

## Verified facts this plan relies on

Checked against the installed `stripe@22.3.2` types and this repo:

- `stripe.billingPortal.sessions.create({ customer, return_url, configuration? })` returns a
  session with `url` (`cjs/resources/BillingPortal/Sessions.d.ts`).
- `Subscription` has `cancel_at_period_end: boolean` and `cancel_at: number | null`; the billing
  period end is on each item, **`items.data[i].current_period_end`** (not on the subscription
  itself in this API version), with `items.data[i].price` and `quantity`
  (`cjs/resources/Subscriptions.d.ts`, `SubscriptionItems.d.ts`).
- Both billing tables already store `providerCustomerId` (`packages/db/src/schema.ts:171,278`) —
  the portal session needs it.
- The webhook already maps `customer.subscription.updated` → `subscription_updated` with status
  and `seatQuantity` (from `items.data[0].quantity`), and `.deleted` → `subscription_canceled`,
  which resets the plan to the default (`billing.handlers.ts`'s `endsSubscription`). Ordering and
  same-second ties are handled (`organization-billing.db.ts`'s `updateBillingBySubscriptionId`).
- **The webhook ignores a changed price today.** A plan switch in the portal arrives as
  `subscription.updated` with a new `items.data[0].price.id`, and nothing updates our `plan` —
  so without task 3 a customer could upgrade in Stripe while the app keeps enforcing the old
  plan (or downgrade and keep the expensive plan's features).
- `subscription_plans.providerPriceId` is a plain column with no unique index
  (`schema.ts:428`), so price → plan resolution must handle "no match" and must apply the same
  custom-then-shared precedence as `applyCustomPlanPrecedence` (`subscription-plans.db.ts`).

## Architecture

```
packages/core/src/billing/types.ts       BillingGateway: + createManagementSession(customerId,
                                         returnUrl); subscription_updated event: + priceId,
                                         + cancelAt (Date | null)
apps/api/src/modules/billing/stripe-billing.service.ts   implements both (still the only
                                         file importing `stripe`)
apps/api/src/modules/billing/billing.routes.ts           POST /billing/organization-portal
                                         (billing:manage) and /billing/individual-portal
apps/api/src/modules/billing/billing.service.ts          open portal; resolve price → plan
apps/api/src/modules/billing/billing.handlers.ts         apply plan + cancelAt on updated
apps/api/src/modules/subscription-plans/subscription-plans.db.ts   lookup by providerPriceId
packages/db/src/schema.ts + migration     organization_billing / individual_billing: + cancel_at
apps/portal/src/features/billing/         "Manage billing" button; "Cancels on <date>" notice
```

- **Vendor-agnostic naming:** the gateway method is `createManagementSession`, not
  `createBillingPortalSession` — swapping vendors stays a one-file change (AGENTS.md).
- **Open the portal:** the route resolves the caller's own billing row (`requireOrgContext` +
  `billing:manage` for orgs; ownership for individuals — same as checkout), refuses (422) if
  there's no `providerCustomerId`, and returns `{ url }`. `return_url` is
  `BILLING_CHECKOUT_RETURN_URL` (already the portal's `/billing`).
- **Price → plan, on `subscription.updated`:** look up the plan whose `providerPriceId` matches,
  scoped to the row's owner (org custom plans first, then shared — reuse
  `applyCustomPlanPrecedence`). Found → set `plan`. **Not found → leave `plan` unchanged, log a
  warning, and notify platform staff** (the existing `notifyUsers` path) — never guess, never
  grant. This happens if someone adds a price in Stripe that isn't in the catalog.
- **Cancel at period end:** store `cancelAt` (from Stripe's `cancel_at`, or the item's
  `current_period_end` when `cancel_at_period_end` is true; `null` when not scheduled). The
  status stays `active` until Stripe sends `.deleted` at the period end, which the existing
  handler already turns into "back to the free plan". The UI shows "Your plan ends on <date>"
  while `cancelAt` is set.
- **Remove our own subscription management:** the portal's cancel button and "cancel first to
  switch" messaging go. Keep `POST /billing/*-cancel` for one release, marked deprecated in
  code (staff tooling or old clients may call it), then remove. **Keep** checkout's "refuse while
  a subscription is live" guard — Checkout is now only for the first purchase.
- **Seats:** if the portal configuration allows quantity changes, Stripe's quantity flows into
  `seatQuantity`, which already caps membership (`getOrganizationSeatUsage`). Stripe doesn't
  know our member count, so a customer could drop seats below their current members — existing
  members stay, new joins are refused until seats free up. The UI should say so.

## Stripe dashboard configuration (human task, not code)

In Stripe → Settings → Billing → Customer portal (test mode first, then live):

- Allowed: update payment method, view invoice history, cancel **at end of billing period**.
- Plan switching: add each catalog plan's Product/Price (the prices in `subscription_plans`);
  proration on.
- Quantity changes: on for organization prices if seat purchases should be self-serve.
- Note the configuration id if more than one configuration exists (pass it as `configuration`).

## Tech stack & commands

Existing stack, no new dependencies. One migration (`pnpm db:generate` → review the SQL →
`pnpm db:migrate`; adding a nullable column is non-destructive).

```
pnpm --filter @repo/api test -- src/modules/billing --no-file-parallelism
pnpm --filter @repo/portal test
stripe listen --forward-to localhost:8787/billing/webhook    # local webhook testing
```

## Code style

Follow the existing billing slice exactly — routes list middleware and a named handler,
`billing.service.ts` holds the steps, `.db.ts` the queries, the webhook test payloads in
`billing-integrity.integration.test.ts` (signed with `STRIPE_WEBHOOK_SECRET`). The mapping keeps
the "never trust, never guess" stance of the rest of `billing.handlers.ts`:

```ts
const plan = await getPlanForPrice(ownerType, event.priceId, organizationId);
if (!plan) {
  console.warn(`billing: price ${event.priceId} matches no catalog plan — plan left unchanged`);
  pendingNotification = buildUnknownPriceNotification(/* … */);
}
```

## Testing strategy

All `apps/api` integration tests, signed webhook payloads, no real Stripe needed:

- `subscription.updated` with a different known price switches `plan`; seat quantity follows.
- An org with a custom plan sharing a price with a shared plan resolves to its custom plan.
- An unknown price leaves `plan` unchanged and notifies staff.
- `cancel_at_period_end: true` sets `cancelAt` and leaves the status `active` and the paid plan in
  place; a later `.deleted` resets to the free plan (already tested — keep it passing);
  re-enabling (`cancel_at_period_end: false`) clears `cancelAt`.
- Opening the portal: refused unauthenticated; refused for an org member without
  `billing:manage`; refused (422) with no Stripe customer yet; never uses another org's or user's
  customer id. The happy path that calls Stripe is `it.skipIf(!process.env.STRIPE_SECRET_KEY)`
  (CI has no key — AGENTS.md's CI/CD section).
- Portal component tests: "Manage billing" shown only with a live subscription and permission;
  "ends on <date>" shown while `cancelAt` is set; the old cancel button is gone.

## Tasks

- [ ] **1. Gateway + event contract** (`packages/core`): `createManagementSession`; `priceId` and
      `cancelAt` on `subscription_updated`. Stripe adapter maps them.
- [ ] **2. Migration:** `cancel_at` on both billing tables (nullable). Update the `.db.ts` update
      types.
- [ ] **3. Price → plan mapping** in the webhook + `getPlanForPrice` lookup + integration tests
      (known, custom-precedence, unknown).
- [ ] **4. Cancel-at-period-end mirroring** + tests.
- [ ] **5. Portal session routes** (org + individual) + tests both directions.
- [ ] **6. Portal UI:** "Manage billing", "ends on" notice; remove the cancel button and
      "cancel first" text; component tests.
- [ ] **7. Deprecate** `POST /billing/*-cancel` (comment + CHANGELOG note); schedule removal.
- [ ] **8. Docs:** AGENTS.md Billing model (portal flow, price→plan rule, unknown-price
      behaviour), README (dashboard setup steps), CHANGELOG entry text in the PR.

## Boundaries

- **Always:** keep `stripe` imports inside `stripe-billing.service.ts`; resolve a price to a plan
  only through the catalog with custom-then-shared precedence; scope every portal session to
  the caller's own billing row; keep the webhook the single writer of subscription state.
- **Ask first:** removing the deprecated cancel routes; enabling quantity changes in the portal;
  anything that changes what a customer is charged (proration settings, trial periods).
- **Never:** grant a plan for an unknown price; accept a customer id, price id or plan id from
  the client for the portal route; cancel subscriptions from our code as part of normal
  self-service (account/org deletion keeps its existing immediate cancellation).

## Success criteria

- A subscribed customer can open Stripe's portal from the billing page and come back to it.
- Switching plans in the portal changes the plan this app enforces, within one webhook delivery.
- Canceling in the portal keeps paid access until the period ends, then returns the customer to
  the free plan; the billing page shows the end date meanwhile.
- Updating the card or viewing invoices needs no code of ours.
- A price missing from our catalog never grants a plan and alerts staff.

## Open questions

1. **Self-serve seat changes in the portal?** Simplest for customers; the alternative is keeping
   seat purchases as a staff action.
2. **Remove the deprecated cancel routes when?** Suggest the release after this one.
3. **Account/org deletion** still cancels immediately (correct — the customer is leaving). Should
   it also refund the unused part of the period? Today it doesn't.
