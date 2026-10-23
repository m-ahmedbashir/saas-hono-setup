# Typed API Client (single source of types) — Implementation Plan

Read [specs/README.md](./README.md) first — it holds the rules every workstream follows.

## Objective

The frontends describe `apps/api`'s responses with **hand-written types** that nothing keeps in
sync. If an API field is renamed, `apps/portal`/`apps/admin` still compile and the UI silently
gets `undefined` at runtime — the drift AGENTS.md's Type safety rules exist to prevent.

Make the API code the **single source** of request/response types for every frontend call to
`apps/api`, using Hono's documented approach (the "Hono Stack": Hono + Zod validator + the `hc`
client), and delete the hand-written copies.

**Decision already made (by the human):** Hono RPC (`hc<AppType>`), not a separate contract
package or code generation. OpenAPI (`@hono/zod-openapi`, which supports the same `hc` client)
is a later, additive step — out of scope here.

This plan starts with a **proof spike**: its outcome decides one rule (see Task 1).

## Verified facts this plan relies on

From Hono's docs ([RPC guide](https://hono.dev/docs/guides/rpc),
[best practices](https://hono.dev/docs/guides/best-practices),
[stacks](https://hono.dev/concepts/stacks)) and this repo:

- **Routes must be chained** for types to survive — this repo already chains (`billing.routes.ts`
  is `new Hono().post(...).get(...)`; `app.ts` chains `.route(...)`), and exports
  `export type AppType = typeof app` (`apps/api/src/app.ts`). Nothing imports it yet.
- **Hono advises against separate "Rails-like controller" files** because they lose type
  inference; its alternative is `factory.createHandlers()`. **AGENTS.md currently requires**
  separate `.controller.ts` files. Unknown for this repo:
  - _Input_ types come from the validators, which stay inline in `.routes.ts` — likely fine.
  - _Output_ types: handlers return `success(c, data)`, and `success<T>` is generic
    (`apps/api/src/lib/response.ts`), so the handler's return type is probably still inferred
    from the controller function. **Probably, not proven — Task 1 proves it.**
- **Errors from the global `app.onError` aren't inferred** by the client; Hono provides
  `ApplyGlobalResponse` (present in the installed `hono@4.12.30`) to add them.
- `hc` accepts `init?: RequestInit` — use `{ credentials: "include" }` so the session cookie is
  sent (same as `apiFetch` today).
- **Frontend and backend must use the same Hono version** (mismatches cause "Type instantiation
  is excessively deep"). Today only `apps/api` depends on `hono` (installed `4.12.30`).
- **Editor performance degrades with many routes**; Hono's mitigations: one client per
  sub-app/feature, or pre-compiling client types (`hcWithType`).
- `apps/api/package.json` has **no `exports`/`types` entry**, so other packages can't import
  `AppType` yet.
- **Not every hand-written type file describes `apps/api`.** `apps/admin`'s `users` and `staff`
  features call Better Auth's admin client (`authClient.admin.*`) only; `individuals` uses both
  `authClient.admin` and `apiFetch`. Those Better Auth shapes must be derived from Better Auth's
  client types instead — the pattern `apps/portal/src/features/team/types.ts` already uses.

Files with hand-written API types today:

| File                                                      | Data comes from   | Replace with                  |
| --------------------------------------------------------- | ----------------- | ----------------------------- |
| `apps/portal/src/features/billing/api/types.ts`           | `apps/api`        | `AppType`                     |
| `apps/admin/src/features/subscription-plans/api/types.ts` | `apps/api`        | `AppType`                     |
| `apps/admin/src/features/organizations/api/types.ts`      | `apps/api`        | `AppType`                     |
| `apps/admin/src/features/notifications/api/types.ts`      | `apps/api`        | `AppType`                     |
| `apps/admin/src/features/individuals/api/types.ts`        | both              | `AppType` + Better Auth types |
| `apps/admin/src/features/users/api/types.ts`              | Better Auth admin | Better Auth client types      |
| `apps/admin/src/features/staff/api/types.ts`              | Better Auth admin | Better Auth client types      |

## Architecture

```
apps/api/package.json            + "exports": { "./client-types": "./src/client-types.ts" }
apps/api/src/client-types.ts     export type { AppType } (+ ApplyGlobalResponse wrapping, see below)
apps/portal/src/lib/api.ts       hc<AppType>(NEXT_PUBLIC_API_URL, { init: { credentials: "include" } })
apps/admin/src/lib/api.ts        same, for admin
packages/shared/src/             envelope helper: unwrap { success, data } / throw ApiError,
                                 typed from the client's response (replaces apiFetch's casts)
apps/portal, apps/admin          + devDependency "@repo/api": "workspace:*" (type-only import)
                                 + "hono" at exactly apps/api's version
```

- **Type-only import.** Frontends use `import type { AppType } from "@repo/api/client-types"` —
  no server code can reach the browser bundle. Add a lint/typecheck guard if a plain `import`
  would be possible.
- **Keep the response envelope** (`{ success: true, data }` / `{ success: false, error }`,
  AGENTS.md). The shared helper unwraps it and throws `ApiError` with `code`/`status`, exactly as
  `apiFetch` does today — feature code shouldn't change its error handling.
- **Error responses:** wrap `AppType` with `ApplyGlobalResponse` so the client knows `onError`'s
  envelope shape, if the spike shows it's needed for clean error typing.
- **Per-feature clients if the editor slows down** (Hono's own mitigation): e.g. a billing client
  typed from `billingRoutes` only.
- **`apiFetch` is removed** once no caller remains (`packages/shared/src/api-client.ts` and its
  tests move to the new helper).

## Tech stack & commands

Adds `hono` (same version as `apps/api`) to the two frontends, and `@repo/api` as a type-only
dev dependency. No other new packages.

```
pnpm install
pnpm --filter @repo/portal typecheck && pnpm --filter @repo/portal test
pnpm --filter @repo/admin typecheck && pnpm --filter @repo/admin test
pnpm --filter @repo/api typecheck
pnpm turbo run build
```

## Code style

Feature services keep their shape; only the call and its types change:

```ts
// apps/portal/src/features/billing/api/service.ts
import { api } from "@/lib/api";
import { unwrap } from "@repo/shared/api-response";

export async function getOrganizationBilling() {
  return unwrap(await api.billing.organization.$get()); // type inferred from apps/api
}

// Derived where a component needs to name it — never hand-written:
export type OrganizationBilling = Awaited<ReturnType<typeof getOrganizationBilling>>;
```

## Testing strategy

- **Type-level proof (Task 1):** a test file using `expectTypeOf` (Vitest) asserts the inferred
  response types of a few billing routes match what the server returns — and a deliberate
  mismatch fails `typecheck`. This is what "single source" means; a runtime test can't show it.
- **Existing component tests stay green unchanged** (they mock `fetch`, which `hc` uses) — if a
  test needs rewriting, explain why in the PR.
- The envelope helper keeps `api-client.test.ts`'s cases (success unwrap, typed `ApiError`,
  non-envelope failure → `HTTP_ERROR`, `error: null` → `HTTP_ERROR`, caller headers preserved).

## Tasks

- [x] **1. Spike — decides the controller rule.** Export `AppType`, add the portal client, convert
      `apps/portal`'s billing service only. Prove with `expectTypeOf` that request and response types
      flow **through our separate `.controller.ts` files**.
  - **If they flow:** keep the controller rule; record the proof in AGENTS.md.
  - **If they don't:** stop and report to the human with the evidence and a proposal (Hono's
    `factory.createHandlers()` pattern). **Don't change the controller rule without approval** —
    it's a standing AGENTS.md rule affecting every feature.
  - Also measure editor/typecheck time before vs after; if noticeably slower, use per-feature
    clients.
- [x] **2. Envelope helper** in `packages/shared` (typed unwrap + `ApiError`), ported tests.
- [x] **3. Portal billing:** delete `features/billing/api/types.ts`; derive any named types.
- [x] **4. Admin client** + convert `subscription-plans`, `organizations`, `notifications` (one
      commit each, each deleting its `types.ts`).
- [x] **5. Admin `individuals`:** `AppType` for `apps/api` calls, Better Auth types for
      `authClient.admin` calls.
- [x] **6. Admin `users` and `staff`:** derive from Better Auth's admin client types (like
      `apps/portal/src/features/team/types.ts`); delete the hand-written types.
- [x] **7. Remove `apiFetch`** once unused.
- [x] **8. Docs:** AGENTS.md rule — "frontends get `apps/api` types from `AppType` and Better Auth
      types from its client; never hand-write either" — plus the spike's controller finding; update
      the `apps/admin`/`apps/portal` sections that describe `apiFetch`; README if setup changed;
      CHANGELOG entry text in the PR.

## Boundaries

- **Always:** type-only imports from `@repo/api`; same `hono` version everywhere (pin it, and note
  in AGENTS.md that bumping it means bumping all three); keep the response envelope and `ApiError`.
- **Ask first:** changing AGENTS.md's controller rule; adding `@hono/zod-openapi`; changing any
  API response shape (this plan changes types' _source_, not the API).
- **Never:** hand-write a type for an `apps/api` or Better Auth response; import runtime code from
  `apps/api` into a frontend; loosen types with `as`/`any` to make inference "work" — if inference
  fails, that's a finding to report.

## Success criteria

- Zero hand-written API response types remain in `apps/portal`/`apps/admin`.
- Renaming a field in an `apps/api` response makes the affected frontend fail `typecheck`
  (demonstrate once in the PR, then revert).
- The controller-rule question is answered with evidence, and AGENTS.md says which pattern to use.
- All checks in specs/README.md's Definition of done pass; no user-visible behaviour changes.

## Open questions

1. If the spike shows controllers break inference: switch to `factory.createHandlers()` for every
   feature now, or only for routes the frontends call? (Decided after Task 1, with evidence.)
2. Should responses also be validated at runtime (parse with Zod on the client)? Not needed for
   type safety — only worth it if the API is ever consumed by clients we don't build.
