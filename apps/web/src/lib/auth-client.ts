import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient } from "better-auth/client/plugins";
// Deliberately NOT `@repo/core/auth` (or the package root `@repo/core`, which
// re-exports it) — that module's top level constructs the live Better Auth server
// instance via `betterAuth()`, importing `@repo/db`'s real Postgres connection pool.
// Bundled into a client component, that would ship a DB-connecting module into the
// browser. `platform-permissions.ts` has its own dedicated, side-effect-free subpath
// export (packages/core/package.json) specifically so this file can import just the
// pure `createAccessControl`/`newRole` values without pulling that in.
import { platformAccessControl, platformRoles } from "@repo/core/auth/platform-permissions";

// Points straight at apps/api — no Next.js route-handler proxy in between. Browser
// requests carry the session cookie automatically (`credentials: "include"` is the
// client's default), and apps/api's CORS already allows this origin with credentials
// (see AGENTS.md's Auth model section). organizationClient/adminClient mirror the two
// plugins actually registered on the server (packages/core/src/auth/index.ts) — a client
// plugin here that isn't registered server-side would just 404 on every call.
//
// adminClient's `ac`/`roles` must mirror the server's platform-permissions.ts exactly —
// unlike the server plugin (a custom `roles` map there REPLACES its defaults), the
// client plugin MERGES custom roles on top of its own admin/user defaults (verified
// against the installed client.mjs: `{ admin: adminAc, user: userAc, ...options?.roles
// }`). Passing the same `platformRoles` here isn't about authorization — the client
// never enforces anything, the server call above already does — it's so
// `authClient.admin.createUser`/`setRole`/etc. are correctly typed for "support", not
// just Better Auth's own default "admin"/"user".
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [organizationClient(), adminClient({ ac: platformAccessControl, roles: platformRoles })],
});

export const { useSession, signIn, signOut } = authClient;
