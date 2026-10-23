# Customer Portal (`apps/portal`) — Implementation Plan

## Objective

Today this repo has `apps/api` (the real backend, already serves both organizations and
individuals) and `apps/admin` (a **staff-only** back office — every page is gated behind
`PlatformAccessGate`; there is no page anywhere a real customer can reach). `apps/portal`
is the missing third app: where an actual customer — a B2B organization member, or a B2C
solo individual with no organization — signs in and manages their own account.

**One portal, not two.** B2B and B2C share the same backend, the same Better Auth session
model, and the same core screens (sign-in/up, profile, billing). The only real difference
is whether the session has an active organization — that toggles a couple of sections
(team management, org-vs-individual billing view), not the whole app. This mirrors how
GitHub, Linear, Notion, and Vercel do it: one app, one login, nav conditionally shows
org-specific stuff in a team context. Splitting into two apps would duplicate
auth/profile/billing-shell code for zero real isolation benefit.

**B2B2C is out of scope for this spec.** It's a real future direction (an org reselling
to its own end customers, who'd need a still-different, org-branded surface), but nothing
here should be built to anticipate it. Noted in Open Questions, not designed for.

## What already exists vs. what's missing

Verified directly against the installed `better-auth@1.6.23` source and the current
`apps/api` route tree — not assumed. This is the actual gap this plan has to close.

| Capability                           | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign up / sign in                    | **Exists, zero new backend code.** `POST /api/auth/sign-up/email` and `/sign-in/email` are core Better Auth endpoints, `emailAndPassword: { enabled: true }`, no restriction, no email verification required today. Unlike `apps/admin` (staff are provisioned by other staff, no self-signup UI exists), the portal genuinely needs a sign-up **page** — B2C individuals have no one to provision them.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Own profile (name/password)          | **Exists, zero new backend code.** Identical to what was just built for `apps/admin`'s `/dashboard/profile`: `authClient.updateUser({name})`, `authClient.changePassword(...)`. Directly reusable pattern.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| View own billing/plan status         | **Missing.** The only places that read a `billing`/`individual_billing` row today are platform-staff detail views (`GET /platform-organizations/:id`, `GET /platform-individuals/:id`) and an internal read inside account-deletion cleanup. No self-service `GET` exists. **New routes needed.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Upgrade/change plan (checkout)       | **Exists, zero new backend code.** `POST /billing/organization-checkout` (owner/admin, gated on `billing:manage`) and `POST /billing/individual-checkout` (any authenticated user, ownership-based) are already built and tested (`billing.integration.test.ts`, `individual-billing.integration.test.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Cancel subscription (keep account)   | **Missing.** `StripeBillingService.cancelSubscription()` exists but is only ever called internally during account/org **deletion**. There is no "cancel my subscription, keep my account" endpoint anywhere. **New routes needed.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Team management (invite/remove/role) | **Blocked today, not just unbuilt.** Better Auth's org plugin ships built-in `inviteMember`/`removeMember`/`updateMemberRole`, and invitations work with **no email infra** (`sendInvitationEmail` is called only `if (ctx.context.orgOptions.sendInvitationEmail)` — confirmed in `crud-invites.mjs`; an invitation record is created either way, shareable as a link/id, same precedent as staff creation's "share the password directly"). **But** `packages/core/src/auth/permissions.ts`'s custom `accessControl`/`roles` fully _replaced_ Better Auth's default org statement — and the replacement never defined `member`/`invitation`/`team`/`ac` resources at all. Every org role, including owner, is currently denied on any client-driven invite/remove/role-change call. `auth.api.addMember` works in integration tests only because it's called server-side with no session/permission check — not the code path a real portal request goes through. **Must fix `permissions.ts` before any team-management UI can work.** |

## Required backend work (before or alongside the frontend build)

All in `apps/api`, following the exact conventions in the root `AGENTS.md` (handler logic
never in `.routes.ts`, `ValidatedJsonContext` pattern, `injectUserContext` for
ownership-based access, `requirePermission` for role-gated access):

1. **`packages/core/src/auth/permissions.ts`** — extend the custom `statement`/`ownerRole`/`adminRole`
   to grant `member: ["create", "update", "delete"]` and `invitation: ["create", "cancel"]`,
   mirroring Better Auth's own sensible defaults (verified above), the same way
   `platform-permissions.ts` previously extended the platform `admin` role without
   silently changing its existing grants. `memberRole` gets none of these, matching
   Better Auth's own default `memberAc`.
2. **New `apps/api/src/modules/billing` routes**:
   - `GET /billing/organization` — self-service, any active-org member can view (read-only
     org-shared info, same reasoning as `GET /organization-profile`), returns plan/status/seat count.
   - `GET /billing/individual` — self-service, ownership-based (`injectUserContext` only).
   - `POST /billing/organization-cancel` — owner/admin only (`billing:manage`), calls
     `billingService.cancelSubscription` + updates the local row's `subscriptionStatus`.
   - `POST /billing/individual-cancel` — ownership-based, same shape for individuals.
   - The checkout button that calls the existing `organization-checkout`/`individual-checkout`
     routes **must** generate and send a stable `Idempotency-Key` per checkout attempt —
     the backend already accepts one end-to-end but nothing has ever sent it (see
     `specs/billing-integrity-plan.md`'s "Outbound idempotency" section for why this
     matters and exactly what "stable" means here).
3. **Depends on `specs/billing-integrity-plan.md`** — a separate, `apps/api`-only plan for
   the billing event ledger and webhook idempotency, scoped independently so it isn't
   rushed alongside this frontend build. The two new `-cancel` routes above should insert
   into that plan's `billing_events` ledger once it exists, not just update the
   current-state row in isolation. Sequencing: the ledger plan is small and self-contained
   enough to land first without blocking the portal's frontend scaffolding, which can
   proceed in parallel.
4. **No changes needed** to `checkout`/webhook routes, `organization-profile`, or the
   notification system otherwise — all reusable as-is.

## Architecture

- **New app**: `apps/portal`, mirroring `apps/admin`'s exact tech stack (Next.js 16,
  Tailwind v4, shadcn/ui, TanStack Form + React Query, Better Auth client,
  `next.config.ts`/`eslint.config.mjs`/`vitest.config.ts` copied and adapted, same
  `package.json` dependency set). Independent deployment, independent origin, **separate
  login/UI from `apps/admin`** — different audience, different pages.
- **Auth client**: `organizationClient()` only — no `adminClient`/`platformRoles` (this
  audience is never platform staff).
- **Backend**: same `apps/api`, same Better Auth tables. Only change needed there is a new
  entry in `ALLOWED_ORIGINS` (both apps read the same env var — see
  `packages/core/src/auth/index.ts`'s `trustedOrigins` and `apps/api/src/lib/allowed-origins.ts`).
  Concretely: `apps/admin`'s `dev` script is bare `next dev` (no `-p` flag), so it always
  claims Next.js's default port 3000 — confirmed via its `package.json` and its own
  `.env.local`. `apps/portal` needs an explicit, _fixed_ port in its own `dev` script
  (e.g. `next dev -p 3002`) so the two can run side by side locally without one silently
  auto-incrementing onto a port the other expects; local `ALLOWED_ORIGINS` becomes
  `http://localhost:3000,http://localhost:3002`.
- **Cookie/session namespace — a correction to an earlier draft of this plan.** An
  earlier version of this doc claimed "no shared session with `apps/admin`" as if that
  were automatic. It isn't, and stating it without checking would have been exactly the
  kind of unverified claim this repo's own conventions warn against. Verified directly:
  `packages/core/src/auth/index.ts` sets no custom `advanced.cookiePrefix`/`basePath`, so
  Better Auth issues its one default session cookie, scoped to `apps/api`'s own origin —
  and since both `apps/admin` and `apps/portal` call that _same_ API origin with
  `credentials: "include"`, they share one cookie jar entry for it. In the same browser,
  a session started on one app is a valid session on the other too. This is **not a
  privilege-escalation risk** — every sensitive action is independently permission-gated
  server-side (`requirePlatformPermission`, `requirePermission`, ownership checks) based
  on the session's actual role/org, never on which frontend the request came from — but
  it is a real same-browser UX overlap (e.g., a staff member testing both apps in one
  browser session sees themselves "logged in" on both). Deliberately **not fixing this
  now**: true isolation would mean a second Better Auth instance or a custom cookie
  scheme, both bigger and more invasive than anything else in this plan, for a cosmetic
  edge case with no real capability leak behind it. Documented as an accepted tradeoff in
  Open Questions, not silently ignored.
- **Shared code**: new `packages/ui` houses only genuinely audience-agnostic, zero-variance
  frontend infrastructure — `apiFetch`/`ApiError` (`api-client.ts`), `getQueryClient`
  (`query-client.ts`), `cn`/`formatBytes` (`utils.ts`). Both `apps/admin` and `apps/portal`
  import from it; `apps/admin`'s local copies get deleted once migrated, not left duplicated.
  shadcn UI primitives (`Button`, `Card`, `Input`, ...) are **not** shared — freshly vendored
  into `apps/portal`, matching shadcn's own vendoring model and how `apps/admin` itself was set up.
  `auth-client.ts` is **not** shared either — each app's plugin set genuinely differs
  (admin needs `adminClient`+platform roles, portal doesn't), and it's a ~10-line file;
  forcing a shared abstraction across two different plugin sets would cost more than it saves.

## Frontend structure (per `/nextjs-shadcn-frontend`)

Every feature below gets built via that skill's One-Shot Invocation Protocol: a Surface
Definition stated up front (surface type, route, data source, user states, layout
choice), then the full required file set (`page.tsx` → `<feature>-view.tsx` → skeleton/
empty/error states → `hooks/use-<feature>.ts` → `schemas/` → `types.ts`), not partial
scaffolding. Server Components by default; `"use client"` only where session/mutation
state genuinely requires it — same discipline already applied when `apps/admin`'s
notifications and profile features were built.

```
apps/portal/src/
  app/
    auth/sign-in/page.tsx
    auth/sign-up/page.tsx              # new — apps/admin never needed this
    auth/accept-invite/page.tsx        # new — see "Invitation acceptance route" below
    (portal)/profile/page.tsx
    (portal)/billing/page.tsx          # conditionally renders org-billing vs individual-billing
    (portal)/team/page.tsx             # only reachable/shown when session has an active org
    (portal)/layout.tsx                # top nav + account menu, no admin-style staff sidebar
  features/
    auth/            # sign-in-view.tsx, sign-up-view.tsx, accept-invite-view.tsx, schemas/
    profile/          # identical pattern to apps/admin's, just a different package
    billing/          # view + upgrade (existing checkout) + cancel
    team/             # member list, invite (shareable link), remove, role change
  lib/
    auth-client.ts    # organizationClient() only
```

**Invitation acceptance route.** `authClient.organization.inviteMember` returns an
invitation id, not a full URL — the portal owns constructing the shareable link as
`/auth/accept-invite?id=<invitationId>` and the owner copies it out to share manually (no
email send, per the ledger's already-established precedent). That page has two paths
depending on whether the visitor already has an account: signed-in → call
`authClient.organization.acceptInvitation({invitationId})` directly; not signed-in → show
the sign-up form first (pre-filled with the invitation's email if Better Auth's payload
includes it), complete sign-up, _then_ accept — never let someone accept an invitation
without first proving they're the invited person via a real session.

**Org-switch cache invalidation.** Switching active organization
(`authClient.organization.setActive`) changes which org's billing/team data is correct to
show — `useNotificationSocket`'s existing pattern of "treat the change as a signal, not a
value" applies here too: on a successful `setActive`, call
`queryClient.invalidateQueries()` (broadly, not per-key — an org switch invalidates
enough different feature areas that a broad invalidation is simpler and cheaper than
tracking every affected key individually) so billing/team views refetch immediately
rather than showing the previous org's data until an unrelated navigation happens to
refetch it.

`packages/ui`'s `apiFetch`/`getQueryClient`/`cn` get imported wherever `apps/admin`'s
features currently import their local `lib/api-client.ts` etc.

## Tech Stack & Commands

Identical to `apps/admin` — Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack
Form/Query, Better Auth 1.6.23, Vitest + Testing Library.

```
Dev:       pnpm --filter @repo/portal dev
Build:     pnpm --filter @repo/portal build
Typecheck: pnpm --filter @repo/portal typecheck
Lint:      pnpm --filter @repo/portal lint
Test:      pnpm --filter @repo/portal test
```

No `turbo.json`/`pnpm-workspace.yaml` changes needed — both already glob `apps/*`.

## Code Style

Match `apps/admin` exactly — same `apiFetch<T>` envelope handling, same `useAppForm`/
`FormTextField` pattern, same Zod-schemas-are-UX-only-server-is-authority convention. One
example, straight from the just-built profile feature (this is the literal template for
the portal's own profile page):

```tsx
const form = useAppForm({
  defaultValues: { name: currentName } as UpdateNameValues,
  validators: { onSubmit: updateNameSchema },
  onSubmit: async ({ value }) => {
    const { error } = await authClient.updateUser({ name: value.name });
    if (error) return setFormError(error.message ?? "Failed to update name");
    router.refresh();
  },
});
```

## Testing Strategy

Same as `apps/api`'s existing convention (no isolated test DB in this repo yet — see
`AGENTS.md`): integration tests hit the real dev Postgres via a dedicated port, self-clean
in `afterAll`. New backend routes (billing view/cancel, permissions.ts change) get
integration tests in the same style as `billing.integration.test.ts` before being
considered done — including a real "owner grants themselves an invite, a second account
accepts it" round trip for the permissions.ts fix, since that's the one genuinely
non-obvious piece of this plan. **Both directions, not just the happy path** — every
other permission-gated route in this repo pairs a "lets role X do this" test with a
"rejects role Y" one (`billing.integration.test.ts`'s "rejects a member without
billing:manage permission" is the exact template), and the `permissions.ts` change is no
exception: a `memberRole` account must be proven **denied** on invite/remove/role-change
calls, not just that `ownerRole`/`adminRole` are allowed — a positive-only test would pass
just as easily if the fix had accidentally granted `member` everything too.

Frontend: Vitest + React Testing Library for anything with real logic (forms, auth
redirects) — mock only I/O boundaries (`fetch`, `next/navigation`, `authClient`), same as
`sign-in-view.test.tsx`.

## Boundaries

- **Always**: run `pnpm typecheck && pnpm lint && pnpm test` before considering any phase
  done; keep `apps/portal` and `apps/admin` fully independent deployments (no shared
  session); update `CHANGELOG.md` + bump every workspace version together per `AGENTS.md`.
- **Ask first**: any change to `packages/core/src/auth/index.ts`'s `betterAuth()` config
  beyond the documented `permissions.ts` extension above (auth config changes are
  high-blast-radius — they affect `apps/admin` too); adding a new third-party dependency
  not already used by `apps/admin`; enabling `sendInvitationEmail`/`changeEmail` (both
  need a real email provider decision, out of scope here).
- **Never**: give the portal any `adminClient`/platform-permission capability; let a
  billing route resolve or act on any user/org other than the caller's own (every new
  route above is ownership- or active-org-scoped, never an `:id` path param); duplicate
  `apps/admin`'s local `api-client.ts`/`query-client.ts`/`utils.ts` instead of importing
  `packages/ui`.

## Rollout

**v1 (this plan):** sign-up + sign-in, own profile, billing view + upgrade + cancel (both
B2B and B2C), team management (invite/remove/role-change) for org owners/admins.

**Explicitly deferred, not designed for yet:**

- B2B2C (an org's own branded end-customer surface)
- Avatar upload (no object storage/upload endpoint exists anywhere in this repo)
- Real invitation emails / email verification (no email-sending infra exists anywhere in
  this repo; invitations work today as shareable links regardless)
- Org profile editing (industry/address/tax ID) — `PATCH /organization-profile` already
  exists and is owner/admin-gated, trivial to add to the portal later, just not v1

## Success Criteria

- A brand-new individual can sign up, land authenticated, update their name and password,
  subscribe to a paid individual plan via real Stripe checkout, and cancel it — all
  without any platform-staff involvement.
- An org owner (provisioned via `apps/admin`'s existing "provision a brand-new owner
  account + organization" flow) can sign in, view their org's current plan, upgrade it,
  invite a teammate (via a shareable invitation link/id), and see that teammate join —
  with the invite/accept round trip actually working, proving the `permissions.ts` fix.
- `apps/admin` still passes every existing test after the `packages/ui` extraction —
  proving the shared-package split didn't regress the staff app.
- Every new backend route has an integration test in the existing style; `pnpm typecheck
&& pnpm lint && pnpm build && pnpm test` pass clean repo-wide.

## Open Questions

- Should individuals get the `profile` module's extra fields (phone/DOB/address) in the
  portal's v1, or defer to a later pass? Not blocking — `GET/PATCH /profile` already
  exists and is self-service; can be added to the profile page trivially whenever wanted.
- What does B2B2C's org-branded surface actually need to look like, when it comes? Left
  fully open on purpose — answering it now would mean designing against a guess.
- The `apps/admin`/`apps/portal` shared-cookie characteristic (see Architecture) is
  accepted as-is for now, not fixed. Revisit only if a real product need for hard session
  isolation shows up (e.g., a staff member routinely also being a customer) — not before.
