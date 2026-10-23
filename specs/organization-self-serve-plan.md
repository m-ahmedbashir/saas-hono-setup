# Organization Self-Serve — Implementation Plan

Read [specs/README.md](./README.md) first — it holds the rules every workstream follows.

## Objective

A B2B SaaS lets a customer start and run their own team without staff help. Today a portal
user can only join an organization through an invitation; organizations otherwise come from
`apps/admin`'s staff provisioning. Add the self-serve basics to `apps/portal`:

1. **Create an organization** (any signed-in user — an individual can start a team).
2. **Organization settings:** rename it, edit its profile (industry, size, website, address…),
   and delete it.
3. **Leave an organization** (any member except its only owner).
4. **Transfer ownership** to another member (owner only).

**Users:** portal users. Creating is open to everyone; the rest follow org permissions.

## Verified facts this plan relies on

Checked against the installed `better-auth@1.6.23` organization plugin and this repo:

- **Creating is allowed for everyone by default.** `crud-org.mjs:56`:
  `allowUserToCreateOrganization` unset → `true`; `organizationLimit` unset → no limit. The
  creator becomes `owner` (`creatorRole`), and this repo's `organizationHooks.afterCreateOrganization`
  (`packages/core/src/auth/index.ts`) creates the `organization_profile` row immediately.
- **Renaming needs a permission this repo doesn't grant yet.** `/organization/update` checks
  `{ organization: ["update"] }`, but `packages/core/src/auth/permissions.ts`'s statement only has
  `organization: ["delete"]` — so **today even an owner is refused**. This plan adds `update`.
- **The only owner can't leave.** `/organization/leave` throws
  `YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER` (`crud-members.mjs`) — so an owner must
  transfer ownership (or delete the org) first.
- **Only an owner can make someone else an owner** (`update-member-role` — confirmed in the
  previous security review of `crud-members.mjs`).
- **Already built in `apps/api`, with no portal UI yet:** `GET`/`PATCH /organization-profile`
  (`organizationProfile: ["manage"]` — owner/admin), `DELETE /organization` (`organization:
["delete"]` — owner only; cancels the Stripe subscription first; never touches members' own
  accounts — see AGENTS.md's Organization deletion section).
- **Switching orgs must go through `apps/portal/src/hooks/use-switch-organization.ts`**
  (AGENTS.md) — it also clears cached data.

## Architecture

```
packages/core/src/auth/permissions.ts            add organization "update" (owner+admin) and
                                                 "transfer-ownership" (owner only)
apps/api/src/modules/organization/                transfer-ownership: route + controller + service
apps/portal/src/app/(portal)/organization/new/page.tsx          create
apps/portal/src/app/(portal)/organization/settings/page.tsx     rename, profile, leave, delete
apps/portal/src/features/organization/
  api/service.ts            Better Auth calls (create, update, leave) + `api` client for apps/api
  components/create-organization-view.tsx
  components/organization-settings-view.tsx
  components/{organization-profile-form,danger-zone,transfer-ownership-dialog}.tsx
  schemas/{create-organization,organization-profile}.schema.ts
```

- **Create:** `authClient.organization.create({ name, slug })`, slug suggested from the name and
  checked with `authClient.organization.checkSlug`. On success, switch to it with
  `useSwitchOrganization` and go to `/team`. Entry points: the organization switcher ("Create
  organization") and `/team`'s "Teams are for organizations" empty state.
- **Rename:** `authClient.organization.update` (needs the new `update` permission).
- **Profile:** the existing `GET`/`PATCH /organization-profile` via
  `unwrap(await api["organization-profile"].$get())` / `.$patch({ json })`. `orgNumber` is
  read-only and system-generated — show it, never send it.
- **Leave:** `authClient.organization.leave`. Hide it for the only owner and explain why; still
  handle the server's refusal code with a plain message.
- **Delete:** the existing `DELETE /organization` via `unwrap(await api.organization.$delete())` (not Better Auth's own
  delete, which would skip the Stripe cancellation), behind a confirmation where the user types
  the org name. Switch to the personal account only after `unwrap` resolves — `hc` returns a
  response even when the delete fails, and `unwrap` is what turns that into a thrown `ApiError`.
- **Transfer ownership — one server action, not two client calls.** It's two writes (promote the
  new owner, demote the old one); doing them from the browser can leave the org half-changed if
  the second fails. Add `POST /organization/transfer-ownership` in `apps/api` that, for the
  caller's active org: requires the new `organization: ["transfer-ownership"]` permission, checks
  the target is a member, **promotes the target first, then demotes the caller to `admin`** (so a
  failure part-way leaves two owners, never zero), using Better Auth's server API with the
  caller's headers. Body validated with Zod (`{ memberId }`). Inline `zValidator` in the route
  chain and no return-type annotation on the controller, so the portal's `api` client gets the
  request and response types automatically.
- **Permissions are checked, never inferred from role names** — reuse `canManageTeam`'s approach
  (`Role.authorize()` on the caller's role from the live member list).

## Tech stack & commands

Existing stack, no new dependencies.

```
pnpm --filter @repo/api test src/modules/organization
pnpm --filter @repo/portal test
pnpm --filter @repo/portal dev
```

## Code style

Server: follow `apps/api/src/modules/billing/` — `.routes.ts` lists middleware and a named
handler; logic in `.service.ts`. Portal: `apps/api` calls follow
`apps/portal/src/features/billing/api/service.ts` (`unwrap(await api.<route>.$get())`, types
inferred — never write a `types.ts`). Better Auth calls follow `apps/portal/src/features/team/` — Better Auth
calls go through a `service.ts` with `unwrap()` that keeps the error `code`
(`TeamActionError`), and known codes map to plain-language messages:

```ts
const friendlyMessages: Record<string, string> = {
  YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER:
    "You're the only owner. Transfer ownership to another member before leaving.",
  ORGANIZATION_ALREADY_EXISTS: "That address is already taken — try another.",
};
```

## Testing strategy

- **`apps/api` integration tests:**
  - An owner and an admin can rename the org; a plain member is refused (proves the new
    `update` permission both ways).
  - Transfer ownership: owner → member works (target is `owner`, caller is `admin`); an admin or
    member calling it is refused; a non-member target is refused; another org's member is refused.
  - The only owner leaving is refused; a member leaving works and their account is untouched.
- **Portal component tests:** create (validation, slug suggestion, taken slug message, switches
  to the new org on success), settings (fields shown per permission, `orgNumber` read-only),
  danger zone (delete needs the typed name; leave hidden for the only owner), transfer dialog.

## Tasks

- [x] **1. Permissions:** add `organization: ["update", "transfer-ownership"]` to the statement;
      grant `update` to owner+admin, `transfer-ownership` to owner. Integration tests both ways.
      _Done 2026-10-24 (merged). Rename tested both ways; `transfer-ownership` is unit-tested
      here, and its endpoint tests land with task 4._
- [x] **2. Create organization** page + switcher/empty-state entry points + tests.
      _Done 2026-10-24. The switcher now shows for users in no organization, so they can
      reach "Create organization"._
- [ ] **3. Settings page:** rename + profile form + tests. _In progress — next up._
- [ ] **4. Transfer ownership** endpoint (test-first) + dialog.
- [ ] **5. Danger zone:** leave + delete + tests.
- [ ] **6. Docs:** AGENTS.md (new permissions, transfer-ownership endpoint), README if anything
      user-facing in setup changed, CHANGELOG entry text in the PR.

## Boundaries

- **Always:** check permissions through the shared `roles` map; switch orgs only through
  `useSwitchOrganization`; delete through `DELETE /organization`.
- **Ask first:** limiting how many organizations a user can create (`organizationLimit`);
  restricting who can create one (`allowUserToCreateOrganization`); letting the owner role be
  removed entirely; any change to `packages/core/src/auth/index.ts`.
- **Never:** let an org end up with zero owners; accept `orgNumber` from the client; delete or
  modify any member's own account when an org is deleted or left.

## Success criteria

- A brand-new individual can create an organization from the portal and land on its team page
  as owner, with its profile row (and `orgNumber`) created.
- An owner/admin can rename the org and edit its profile; a member sees it read-only.
- An owner can transfer ownership; the org always has at least one owner, before and after.
- A member can leave; the only owner is told to transfer first.
- An owner can delete the org after typing its name; their personal account and every member's
  account still exist afterwards.

## Open questions

1. **Limit organizations per user?** Default is unlimited. Many SaaS products cap free users at
   one or a few.
2. **Should creating an organization require a verified email?** Only possible once the email
   spec ships; reduces spam signups.
3. **Slug visibility:** slugs aren't used in any URL today. Keep them internal (auto-generated,
   not shown) unless org URLs are planned.
