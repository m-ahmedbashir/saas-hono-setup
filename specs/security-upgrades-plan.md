# Security Upgrades & Better Auth 1.7 — Implementation Plan

Read [specs/README.md](./README.md) first — it holds the rules every workstream follows.

## Objective

Close the known vulnerabilities in our dependencies, move Better Auth to 1.7, and then turn on
production rate limiting with counters shared across API instances.

A `pnpm audit` on 2026-10-23 found **10 critical, 30 high, 42 moderate and 4 low** advisories.
Several are **unauthenticated remote code execution in Next.js 16.2.6**, which both frontends
run. Order the work by real exposure: production runtime first, dev tooling after.

**Users:** everyone. A compromised server or a bypassed check hurts every customer. Rate
limiting protects sign-in, sign-up and password reset from brute force.

## Verified facts this plan relies on

Checked on 2026-10-23 with `pnpm audit`, `npm view`, the Better Auth 1.7 upgrade guide and this
repo. **Re-run `pnpm audit` before starting — new advisories appear weekly.**

### Version policy — not "latest", the smallest safe jump

- **Target the newest patch of the release line that fixes the advisory**, not the newest
  major. A bigger jump adds breaking changes without adding security. Every target below was
  checked this way (e.g. Next 16.4.x, not 17; `@hono/node-server` 1.19.x, not 2.x; Vitest 4.1.x,
  not 5).
- **Don't install a version published less than 3 days ago.** Fresh releases are how npm
  supply-chain attacks spread (a hijacked maintainer account publishes a malicious version;
  it's usually caught and pulled within days). Task 0 makes pnpm enforce this. Release dates of
  the targets, checked 2026-10-23: next 16.4.2 (10-15), hono 4.13.13 (10-04), drizzle-orm
  0.45.4 (10-08), drizzle-kit 0.31.11 (09-21), sharp 0.35.5 (09-27), vitest 4.1.12 (10-15),
  better-auth 1.7.12 (10-20), `@hono/node-server` 1.19.17 (07-27).
- **Compatibility checked:** `next@16.4.2` itself requires `sharp@^0.35.5`; `@hono/zod-validator`
  0.9.x accepts `hono >=4.11.2`; `@hono/node-ws` accepts `@hono/node-server ^1.19.11`;
  `vitest@4.1.12` needs Vite 6–8 and supports Node 22.
- If a newer patch has appeared by the time a task starts, use it (once it's 3+ days old) and
  re-check the audit.

### Production runtime (exploitable on a live server)

| Package (where)                     | Now → fix              | Why it matters here                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `next` (admin, portal)              | 16.2.6 → **16.4.2**    | Unauthenticated RCE in the Image Optimization API (SVG, AVIF), in `use cache`, in `next/og`, and on Windows-hosted servers. Proxy/middleware bypass, SSRF in image optimization and rewrites, cache poisoning. Image optimization is on by default, and admin's `next.config.ts` sets `images.remotePatterns`. |
| `sharp` (admin direct, and Next's)  | 0.33/0.34 → **0.35.5** | libvips, libheif and librsvg CVEs, reached through image optimization.                                                                                                                                                                                                                                         |
| `hono` (api, admin, portal, shared) | 4.12.30 → **4.13.13**  | ReDoS in the CORS middleware, which `apps/api/src/app.ts` uses. Also a query parser that reads past the URL fragment and unbounded `parseBody()` nesting. The rest (SSG, JSX, `serveStatic`, `memo`) are helpers we don't use.                                                                                 |
| `@hono/node-server` (api)           | 1.19.14 → **1.19.17**  | Path traversal in `serve-static` on Windows. We don't use it, but it's a patch release. Stay on 1.x; 2.x is a major version.                                                                                                                                                                                   |
| `drizzle-orm` (db)                  | 0.38.4 → **0.45.4**    | SQL injection through improperly escaped identifiers. 0.38.4 is also already **outside Better Auth's peer range** (`^0.45.2`, in both 1.6.23 and 1.7.x).                                                                                                                                                       |

### Dev and build only (developer machines and CI)

| Package                                                           | Now → fix                                  | Note                                                                                                                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest` (every package)                                          | 2.1.9 → **4.1.12** (not 5)                 | Critical: a tinypool prototype-pollution-to-RCE gadget, file read and execution through the UI server, and mocker path traversal. **4.1.12** is the lowest version that clears all of them. |
| `vite` / `@vitejs/plugin-react`                                   | vite 5.4.21 → ≥ 6.4.4 (plugin-react 4 → 6) | `fs.deny` bypass on Windows, path traversal, and `launch-editor` command execution. This is a Windows dev machine.                                                                          |
| `drizzle-kit` (db)                                                | 0.30 → **0.31.11**                         | Brings old `esbuild` and `shell-quote` (a critical command injection) through `gel`. 0.31.4 or newer is also Better Auth's peer requirement.                                                |
| `@faker-js/faker`, `sort-by`, `@types/sort-by` (admin)            | **remove**                                 | Template leftovers with no imports in `apps/admin/src`. faker has an RCE advisory; `sort-by` pulls in a vulnerable `object-path`.                                                           |
| `brace-expansion`, `braces`, `postcss`, `nanoid`, `source-map-js` | transitive                                 | Come in through eslint, tailwind and Next. Most clear once their parents are bumped. Use `pnpm.overrides` only for what remains (see Boundaries).                                           |

### Better Auth (1.6.23 → 1.7.12)

- **None of Better Auth's 2026 security advisories affect us.** Our config
  (`packages/core/src/auth/index.ts`) uses only `emailAndPassword` plus the `organization` and
  `admin` plugins. The advisories need Magic Link with social sign-in, OAuth Proxy, SSO, SCIM,
  device login or `@better-auth/stripe`. The exception is GHSA-44jh-23m7-hpcf (concurrent
  Postgres requests can exceed database rate limits, fixed in 1.7.7), which **becomes relevant
  the moment we enable database rate limiting**. That's why rate limiting comes after this
  upgrade.
- **What we gain:**
  - Session lookup errors are no longer treated as signed out (1.7.8), so a database blip stops
    looking like a logout or a 401.
  - The rate-limit fix above.
  - Bug fixes across 1.7.1–1.7.12.
- **From the 1.7 upgrade guide:**
  - The account schema is **unchanged from 1.6**. The `issuer` column only applies to installs
    that ran 1.7.0–1.7.2, which we never did.
  - Check for duplicate accounts first:
    `SELECT "providerId", "accountId", count(*) FROM account GROUP BY 1, 2 HAVING count(*) > 1;`
  - Upgrade `better-auth` and any `@better-auth/*` packages together.
  - For Drizzle, run `npx auth generate`, review the output, and apply it with our migration
    tooling (drizzle-kit). `auth migrate` is only for the built-in Kysely adapter.
  - The `auth` CLI needs Node **22.12 or newer**. CI uses `node-version: 22`, which resolves to
    the latest 22.x.
  - The Drizzle adapter now **throws on an invalid affected-row count** instead of returning 0.
  - The cookie-cache session is tied to the `session_token` cookie.
  - `updateMemberRole` runs authorization before checking that the role exists.
  - `getIp` is renamed `getIP`. We don't use it.
- `better-auth@1.7.12` depends on `zod@^4.5.4`. We're on 4.4.3, so bump the repo's `zod` to
  avoid two copies (AGENTS.md: one Zod major, one instance).
- `packages/core/package.json` declares `"better-auth": "^1.1.0"`, while admin and portal say
  `^1.6.23`. Pin all three to the same exact version.

### Rate limiting (verified in the installed 1.6.23 types; re-verify on 1.7.12)

- It's enabled only in production (`rateLimit.enabled ?? isProduction`), and the storage
  default is `"memory"`, so each API instance counts separately.
- Options: `storage: "database"`, per-path `customRules`, `advanced.ipAddress.ipAddressHeaders`
  and `disableIpTracking` (`@better-auth/core` `init-options.d.mts`).
- **The client IP is the rate-limit key.** Behind a load balancer every request can look like it
  comes from the proxy, so everyone shares one bucket. Trusting a header the client can set
  (e.g. raw `X-Forwarded-For`) lets an attacker pick a fresh IP per request. The right header
  depends on the host — see Open questions.

## Architecture

There's no new architecture. These are version bumps, one config block, and one generated
table.

```
apps/admin/package.json, apps/portal/package.json   next, @next/eslint-plugin-next, sharp, hono,
                                                    vitest, @vitejs/plugin-react; admin drops
                                                    faker / sort-by
apps/api/package.json, packages/shared/package.json hono (all four pinned identical),
                                                    @hono/node-server, vitest
packages/db/package.json                            drizzle-orm, drizzle-kit
packages/core/package.json (+ admin, portal)        better-auth pinned exact; zod
packages/core/src/auth/index.ts                     rateLimit { storage: "database", customRules },
                                                    advanced.ipAddress (per Open question 1)
packages/db/src/schema.ts + migration               rateLimit table, from Better Auth's CLI
```

- **Keep `hono` pinned to one exact version in all four packages.** `hc<AppType>` types must
  match between server and client (specs/typed-api-client-plan.md).
- **The `rateLimit` table is generated, not hand-written**, and isn't RLS-protected (Better Auth
  queries it internally). Same rule as the other auth tables in AGENTS.md.
- **Re-verify every AGENTS.md fact that cites Better Auth source** against 1.7.12 before
  relying on it:
  - `has-permission.mjs` (`adminUserIds` short-circuit);
  - `routes.mjs` (headerless `createUser`, `banUser` deleting sessions);
  - `crud-invites.mjs` / `crud-members.mjs` (`membershipLimit` / `invitationLimit` on every
    join path);
  - `access/statement.mjs` / `admin.mjs` (custom roles replace the defaults);
  - `client.mjs` (client roles merge; organization `atomListeners` refetch);
  - `get-full-organization` (the 100-member cap);
  - `organizationHooks.afterCreateOrganization`;
  - `isAPIError` from `better-auth/api`;
  - the CLI command AGENTS.md documents (`npx @better-auth/cli@latest generate`; 1.7 documents
    `npx auth generate`).

  Update AGENTS.md wherever 1.7 differs.

## Tech stack & commands

```
pnpm audit                                   # before and after every task
pnpm audit --prod --audit-level high         # the bar for production dependencies
pnpm --filter <pkg> add <dep>@<exact-version>
pnpm db:generate                             # after drizzle bump: must report no schema changes
npx auth generate --config packages/core/src/auth/index.ts --output packages/db/src/auth-schema.generated.ts
pnpm --filter @repo/api test
```

Plus the full check list in specs/README.md's Definition of done after each task.

## Code style

Rate-limit config follows the existing `betterAuth()` block, with a short _why_ comment like
its neighbours:

```ts
rateLimit: {
  // Shared counters: with memory storage each API instance counts separately, so the real
  // limit would multiply by the instance count.
  storage: "database",
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
    "/sign-up/email": { window: 60, max: 3 },
    "/request-password-reset": { window: 60, max: 5 },
  },
},
```

The numbers are placeholders until Open question 2 is answered.

## Testing strategy

- **Every bump:**
  - all checks from the Definition of done;
  - `pnpm audit` shows the targeted advisories gone;
  - boot `apps/api` plus both frontends and sign in through the real proxy (`proxy.ts`
    redirects still work after the Next.js upgrade).
- **drizzle bump:**
  - `pnpm db:generate` produces **no** migration (no schema drift);
  - every integration test passes, especially the RLS blocks and
    `ensureOrganizationProfileRow`'s savepoint retry. Re-confirm in the new driver source that
    nested `transaction()` still issues a `SAVEPOINT`.
- **Better Auth bump:**
  - the full `apps/api` suite. The admin-plugin, organization-permissions, seat-limit and
    billing tests prove the re-verified facts above;
  - the portal and admin component tests;
  - the CLI schema generation shows no changes to the existing tables.
- **Rate limiting:** one integration test that enables it explicitly (it's off outside
  production) proves:
  - a sign-in burst over the limit gets 429;
  - a second client isn't affected;
  - with two `auth` instances sharing the database, the limit holds across both.

## Tasks

Each task is its own small PR from `develop`, in this order.

- [x] **0. Guard rails (tiny).**
  - Root `package.json` `engines.node`: `>=22` → `>=22.23.4` (Node's latest security release).
  - `pnpm-workspace.yaml`: `minimumReleaseAge: 4320` (3 days, in minutes; pnpm 10.16+, we run
    10.30.3) so `pnpm add`/`install` refuses versions younger than that. If an emergency patch is
    newer, add it to `minimumReleaseAgeExclude` temporarily, with a comment, and remove it later.

- [x] **1. Next.js + sharp (urgent).** Update `next` and `@next/eslint-plugin-next` to 16.4.2 in
      both apps, and `sharp` to 0.35.5. Ship this first. **If anything is deployed, do this
      today**, before any other work.
- [x] **2. Hono.** Update `hono` to 4.13.13 in all four packages (exact pin) and
      `@hono/node-server` to 1.19.17. Keep the `client-types` type test green.
- [x] **3. Remove unused template packages** from admin: `@faker-js/faker`, `sort-by`,
      `@types/sort-by`. First confirm nothing imports them, including scripts.
- [x] **4. Drizzle.** Update `drizzle-orm` to 0.45.4 and `drizzle-kit` to 0.31.11; check the
      generated output for no drift, and run the RLS and savepoint checks. Read drizzle's
      changelog from 0.39 to 0.45 for breaking changes first.
- [x] **5. Dev tooling.** Update `vitest` (every package), `vite` and `@vitejs/plugin-react`.
      Handle the remaining transitive advisories (eslint's `brace-expansion` and others), using
      overrides only where a parent bump can't clear them.
- [x] **6. Better Auth 1.7.12 + zod.** Run the duplicate-account check, pin the exact version in
      core, admin and portal, bump zod, regenerate the schema, re-verify the AGENTS.md facts and
      run all tests. Behaviour should not change.
- [x] **7. Rate limiting.** Set `storage: "database"` and `customRules`, plus the IP header
      config once Open question 1 is answered. Generate the table, migrate, and add the
      integration test. This replaces task 4 of
      [account-security-and-settings-plan.md](./account-security-and-settings-plan.md).
- [x] **8. Docs.** Update AGENTS.md (versions, re-verified facts, the CLI command, the
      rate-limit section), README (anything changed in setup) and the CHANGELOG entry text in
      each PR.

## Boundaries

- **Always:**
  - one package group per PR;
  - exact versions for `hono` and `better-auth`;
  - re-run `pnpm audit` and the full check list after each task;
  - verify library behaviour in the installed source after every bump (specs/README.md
    rule 3).
- **Ask first:**
  - any major upgrade not listed here (`@hono/node-server` 2.x, Next 17, ESLint majors);
  - adding `pnpm.overrides`;
  - the rate-limit numbers and the IP header;
  - changing CI (e.g. adding an audit step);
  - adopting new 1.7 features (`hydrateSession`, `getOrganization`).
- **Never:**
  - `pnpm update --latest` across the whole repo in one go;
  - `--force`, or ignoring peer-dependency errors to make an install pass;
  - hand-editing the generated auth tables;
  - silencing an advisory without a real fix;
  - enabling rate limiting with memory storage in production.

## Success criteria

- `pnpm audit --prod --audit-level high` reports **zero** findings, and `pnpm audit` reports no
  critical findings at all.
- Both frontends and the API run on the patched versions. Sign-in, the proxy redirects,
  billing and team flows all work.
- Better Auth is 1.7.12 everywhere, at one exact version. Every AGENTS.md claim about its
  source has been re-checked.
- In production, a sign-in burst from one client is refused after the limit, and the limit
  holds across two API instances.

## Open questions

All answered 2026-10-23; the spec is implemented and merged to `main`.

1. **Hosting and client IP.** Cloudflare (free plan) in front of a managed Node host, with the origin locked to Cloudflare. Rate limiting trusts `cf-connecting-ip`; see README's Deployment notes. The Node host itself is still to be picked.
2. **Rate-limit numbers.** The suggested defaults: sign-in and reset 5/min, sign-up 3/min.
3. **Keep it from happening again.** Yes, both: CI runs `pnpm audit --prod --audit-level high`, and `.github/dependabot.yml` opens security-update PRs only. "Dependabot security updates" still has to be switched on in the repository settings.
4. **Admin's `images.remotePatterns`.** Removed, along with the demo `recent-sales.tsx` (task 3).
