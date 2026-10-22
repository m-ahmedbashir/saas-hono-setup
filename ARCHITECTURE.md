# Architecture

A bird's-eye view of how this repo fits together and how the main flows move through it. It's deliberately short — for the _rules_ (how to write code here) see [AGENTS.md](./AGENTS.md); for _what's shipped_, see [CHANGELOG.md](./CHANGELOG.md); for the reasoning behind a specific feature, see [specs/](./specs/) and [ENTITLEMENTS.md](./ENTITLEMENTS.md).

## The big picture

Two browser apps, one API, one database, one payment provider.

```mermaid
flowchart LR
    customer(["Customer<br/>(individual or org member)"])
    staff(["Platform staff<br/>(admin / support)"])

    subgraph apps["apps/"]
        portal["portal<br/>Next.js · :3002"]
        admin["admin<br/>Next.js · :3000"]
        api["api<br/>Hono · :8787"]
    end

    subgraph packages["packages/"]
        core["core<br/>auth, permissions,<br/>business rules"]
        db["db<br/>schema, queries,<br/>migrations"]
        shared["shared<br/>apiFetch, query client"]
    end

    pg[("Postgres<br/>(Neon)")]
    stripe["Stripe"]

    customer --> portal
    staff --> admin
    portal -- "HTTPS + session cookie" --> api
    admin -- "HTTPS + session cookie" --> api
    portal -.uses.-> shared
    admin -.uses.-> shared
    api --> core
    api --> db
    core --> db
    db --> pg
    api -- "create checkout / cancel" --> stripe
    stripe -- "webhooks" --> api
```

| Piece             | What it is                                                                                                     | Talks to                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `apps/portal`     | Customer self-service: sign up/in, profile, billing (team management in progress)                              | `apps/api` only                           |
| `apps/admin`      | Staff back office: users, organizations, individuals, plan catalog, notifications                              | `apps/api` only                           |
| `apps/api`        | The only backend. Every request is authenticated, permission-checked and validated here                        | Postgres, Stripe                          |
| `packages/core`   | Pure logic — Better Auth config, permission statements, error codes, entitlement rules. No HTTP                | `packages/db` (for Better Auth's adapter) |
| `packages/db`     | Drizzle table definitions (the single source of truth for data shapes), the `db` client, RLS scope helpers     | Postgres                                  |
| `packages/shared` | Frontend plumbing both Next.js apps use — `apiFetch` (unwraps the response envelope), React Query client, `cn` | —                                         |

Two things worth knowing up front:

- **The frontends never touch the database or Stripe.** They call `apps/api` directly (no Next.js proxy route in between). Next.js's `proxy.ts` only checks a session cookie _exists_ to decide where to route the browser — `apps/api` re-checks the real session on every request.
- **One login system for everyone.** Better Auth (configured once, in `packages/core/src/auth`) handles customers and staff alike. What differs is the session: does it have an active organization (org member), a platform role (staff), or neither (individual)?

## How the code is layered

```mermaid
flowchart TB
    apps["apps/api · apps/admin · apps/portal<br/><i>delivery: HTTP, UI</i>"]
    core["packages/core<br/><i>domain: rules, no HTTP</i>"]
    db["packages/db<br/><i>infrastructure: tables, queries</i>"]
    apps --> core --> db
    apps --> db
```

Arrows only point down. `packages/core` never imports Hono or anything from `apps/`, so its logic works the same from a script, a test, or a future non-HTTP entrypoint.

Inside `apps/api`, each feature is a folder under `src/modules/<feature>/` with the same split:

```
<feature>.routes.ts      which URL, which middleware, which handler — nothing else
<feature>.controller.ts  one small function per route: read input, call the service, respond
<feature>.service.ts     the actual steps (resolve a plan, call Stripe, decide outcomes)
<feature>.db.ts          the queries
<feature>.schema.ts      Zod request schemas
```

## Flow 1 — an ordinary API request

What happens when, say, the portal loads `GET /billing/organization`:

```mermaid
sequenceDiagram
    participant B as Browser (portal)
    participant M as Global middleware
    participant R as Route middleware
    participant C as Controller → Service
    participant D as .db.ts
    participant P as Postgres

    B->>M: GET /billing/organization (cookie)
    Note over M: logger · secure headers · CORS · body limit · etag
    M->>R:
    Note over R: injectUserContext — who is this?<br/>requirePermission — are they allowed?<br/>zValidator — is the body valid?
    R->>C:
    C->>D: inside withOrgScope(orgId)
    D->>P: query (Row-Level Security sees only this org)
    P-->>B: { success: true, data }
```

- **`injectUserContext`** turns the session cookie into a `userContext`: either `B2C` (an individual, no org) or `B2B2C` (has an active organization and a role in it). It returns 401 if there's no valid session.
- **`requirePermission({ billing: ["manage"] })`** checks the caller's org role against `packages/core/src/auth/permissions.ts`. Routes ask for a _permission_, never a role name.
- **Data access goes through a scope** — `withOrgScope`, `withUserScope`, or (only for trusted system work like webhooks) `withSystemScope`. Postgres Row-Level Security then enforces the same boundary a second time, so a bug in app code still can't read another tenant's rows.
- **Every response has one shape**: `{ success: true, data }` or `{ success: false, error: { code, message } }`. Code anywhere just `throw new AppError(...)`; one global `onError` formats it. (Exceptions: `/api/auth/**`, `/health`, and the Stripe webhook keep their own shapes.)

## Flow 2 — signing in and "which hat am I wearing?"

```mermaid
flowchart LR
    signin["Sign in<br/>/api/auth/sign-in/email"] --> cookie["Session cookie"]
    cookie --> q{"Session has an<br/>active organization?"}
    q -- no --> b2c["B2C — individual<br/>own profile, own billing"]
    q -- yes --> b2b["B2B2C — org member<br/>org billing, team; what they can do<br/>depends on owner / admin / member"]
    cookie --> staffq{"user.role is<br/>admin / support?"}
    staffq -- yes --> staffhat["Platform staff<br/>/api/auth/admin/**, platform routes"]
```

Org roles (`owner`/`admin`/`member`, on the `member` table) and platform roles (`admin`/`support`, on the `user` table) are two separate systems that happen to share the word "admin". They never mix.

## Flow 3 — buying a plan

Stripe, not this app, takes the payment. The app only starts the checkout and then _listens_ for what happened.

```mermaid
sequenceDiagram
    participant B as Browser (portal)
    participant A as apps/api
    participant S as Stripe
    participant P as Postgres

    B->>A: POST /billing/organization-checkout<br/>(planId, seats, Idempotency-Key)
    A->>A: plan exists, is active, has a price?
    A->>S: create Checkout Session
    S-->>B: checkout URL → browser goes to Stripe
    Note over B,S: customer pays on Stripe's page
    S-->>B: redirect back to /billing?checkout=success
    S->>A: webhook (signed)
    A->>P: record event in billing_events (skip if seen before)
    A->>P: update organization_billing (plan, status)
    B->>A: GET /billing/organization → shows the new plan
```

- **The webhook is the single source of truth** for subscription state. The redirect back only tells the browser "you finished checkout"; the plan changes when the webhook lands, a few seconds later. Cancel works the same way: the API asks Stripe to cancel, and the webhook updates the row — including putting it back on the free (default) plan, so paid features stop.
- **One subscription at a time.** Checkout always creates a _new_ Stripe subscription, so it's refused while one is live; changing plans means canceling first.
- **Duplicates are expected and handled.** Stripe can deliver the same webhook more than once or out of order; `billing_events` ignores an event id it has already seen, and older events can't overwrite newer state. On the way out, the `Idempotency-Key` stops a double-click from creating two checkouts.
- **Only one file knows Stripe exists** — `stripe-billing.service.ts`, behind the `BillingGateway` interface in `packages/core`. Swapping payment providers means replacing that one file.
- **Plans live in the database**, not in code (`subscription_plans`, edited by staff in `apps/admin`). What a plan _unlocks_ (`features`/`limits`) is checked by `requireFeature` — see [ENTITLEMENTS.md](./ENTITLEMENTS.md).

## Flow 4 — notifications

```mermaid
flowchart LR
    trigger["Something happens<br/>(e.g. a payment fails)"] --> save["Save to notification table"]
    save --> push["Push over WebSocket<br/>/ws/:userId, if connected"]
    save --> later["Otherwise read later<br/>via GET /notifications"]
```

Saved first, pushed second — a dropped WebSocket never loses a notification, it just shows up on the next fetch.

## Where things live

| I want to…                        | Look at                                                   |
| --------------------------------- | --------------------------------------------------------- |
| Add an API feature                | `apps/api/src/modules/billing/` (the reference slice)     |
| Change who can do what            | `packages/core/src/auth/permissions.ts`                   |
| Add or change a table             | `packages/db/src/schema.ts`, then `pnpm db:generate`      |
| See all the middleware and routes | `apps/api/src/app.ts`                                     |
| Add a portal or admin page        | `apps/<app>/src/app/` (route) + `src/features/<feature>/` |
| Understand a design decision      | `specs/*.md`, `ENTITLEMENTS.md`, and AGENTS.md's sections |
