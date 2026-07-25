import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { db, eq, user as userTable } from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Proves Better Auth's admin plugin (packages/core/src/auth/index.ts) is actually wired
// and enforcing what AGENTS.md's Platform admin section claims — not just configured and
// untested. Every `/api/auth/admin/**` route comes from the plugin itself (proxied through
// the existing authRoutes catch-all), so there's no custom controller/handler of ours to
// unit test; this is the only place that behavior gets verified at all.

const PORT = 8808;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Admin Plugin Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

async function signIn(email: string, password: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password }),
  });
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-in did not return a session cookie");
  return { cookie: setCookie.split(";")[0]! };
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  for (const userId of cleanupUserIds) {
    await db.delete(userTable).where(eq(userTable.id, userId));
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("Platform admin (Better Auth admin plugin)", () => {
  it("blocks a regular user from the admin API", async () => {
    const regular = await signUp(`admin-plugin-regular-${Date.now()}@example.com`);
    cleanupUserIds.push(regular.userId);

    const res = await fetch(`http://localhost:${PORT}/api/auth/admin/list-users`, {
      headers: { Origin: ORIGIN, Cookie: regular.cookie },
    });
    expect(res.status).toBe(403);
  });

  it('lets a user.role:"admin" account list users, and banning immediately revokes the target\'s session', async () => {
    const email = `admin-plugin-target-${Date.now()}@example.com`;
    const password = "password1234";

    // A direct server-side auth.api.createUser call, no `headers` passed — Better Auth
    // treats this as a trusted call from our own backend code and skips the requesting-
    // user permission check entirely (verified against the installed admin plugin's
    // routes.mjs: `if (!session && (ctx.request || ctx.headers)) throw UNAUTHORIZED` only
    // fires when a request/headers context exists at all). This is the officially
    // supported way to seed the first platform admin. ADMIN_USER_IDS (see
    // packages/core/src/auth/index.ts) is the other bootstrap path, verified by reading
    // has-permission.mjs directly rather than tested here — it's read once from
    // process.env at module load, before this test's generated user id exists, so there's
    // no way to add that id to the list mid-run.
    const created = await auth.api.createUser({
      body: { email, password, name: "Admin Plugin Target", role: "admin" },
    });
    cleanupUserIds.push(created.user.id);

    const admin = await signIn(email, password);

    const listRes = await fetch(`http://localhost:${PORT}/api/auth/admin/list-users`, {
      headers: { Origin: ORIGIN, Cookie: admin.cookie },
    });
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as { users: { id: string }[] };
    expect(listBody.users.some((u) => u.id === created.user.id)).toBe(true);

    const target = await signUp(`admin-plugin-banned-${Date.now()}@example.com`);
    cleanupUserIds.push(target.userId);

    const banRes = await fetch(`http://localhost:${PORT}/api/auth/admin/ban-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: admin.cookie },
      body: JSON.stringify({ userId: target.userId, banReason: "integration test" }),
    });
    expect(banRes.status).toBe(200);

    // Verified against routes.mjs: banUser calls internalAdapter.deleteUserSessions
    // immediately, not just blocking future logins — the target's existing session
    // should already be dead, not just refused on next login attempt.
    const profileRes = await fetch(`http://localhost:${PORT}/profile`, {
      headers: { Origin: ORIGIN, Cookie: target.cookie },
    });
    expect(profileRes.status).toBe(401);
  }, 20000);

  // packages/core/src/auth/platform-permissions.ts switched the admin plugin from
  // Better Auth's own default roles/ac to a custom two-tier one (admin/support).
  // Passing a custom `roles` map REPLACES the plugin's defaults rather than merging —
  // same behavior already documented for the organization plugin — so this proves the
  // switch didn't silently narrow what an "admin" role can do, and that "support" is
  // actually bounded, not tested by reading the config and assuming it's right.
  it('lets a user.role:"admin" account set another user\'s role (not just list/ban) — proves the custom roles/ac still grants full admin capability', async () => {
    const email = `admin-plugin-full-${Date.now()}@example.com`;
    const password = "password1234";
    const created = await auth.api.createUser({
      body: { email, password, name: "Full Admin", role: "admin" },
    });
    cleanupUserIds.push(created.user.id);
    const admin = await signIn(email, password);

    const target = await signUp(`admin-plugin-promote-${Date.now()}@example.com`);
    cleanupUserIds.push(target.userId);

    const setRoleRes = await fetch(`http://localhost:${PORT}/api/auth/admin/set-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: admin.cookie },
      body: JSON.stringify({ userId: target.userId, role: "support" }),
    });
    expect(setRoleRes.status).toBe(200);

    const removeRes = await fetch(`http://localhost:${PORT}/api/auth/admin/remove-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: admin.cookie },
      body: JSON.stringify({ userId: target.userId }),
    });
    expect(removeRes.status).toBe(200);
  }, 20000);

  it('lets a user.role:"support" account list/get users, but blocks set-role, ban, and delete', async () => {
    const email = `admin-plugin-support-${Date.now()}@example.com`;
    const password = "password1234";
    const created = await auth.api.createUser({
      body: { email, password, name: "Support Staff", role: "support" },
    });
    cleanupUserIds.push(created.user.id);
    const support = await signIn(email, password);

    const target = await signUp(`admin-plugin-support-target-${Date.now()}@example.com`);
    cleanupUserIds.push(target.userId);

    const listRes = await fetch(`http://localhost:${PORT}/api/auth/admin/list-users`, {
      headers: { Origin: ORIGIN, Cookie: support.cookie },
    });
    expect(listRes.status).toBe(200);

    const getRes = await fetch(
      `http://localhost:${PORT}/api/auth/admin/get-user?id=${target.userId}`,
      { headers: { Origin: ORIGIN, Cookie: support.cookie } },
    );
    expect(getRes.status).toBe(200);

    const setRoleRes = await fetch(`http://localhost:${PORT}/api/auth/admin/set-role`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: support.cookie },
      body: JSON.stringify({ userId: target.userId, role: "admin" }),
    });
    expect(setRoleRes.status).toBe(403);

    const banRes = await fetch(`http://localhost:${PORT}/api/auth/admin/ban-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: support.cookie },
      body: JSON.stringify({ userId: target.userId, banReason: "should be blocked" }),
    });
    expect(banRes.status).toBe(403);

    const removeRes = await fetch(`http://localhost:${PORT}/api/auth/admin/remove-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: support.cookie },
      body: JSON.stringify({ userId: target.userId }),
    });
    expect(removeRes.status).toBe(403);
  }, 20000);
});
