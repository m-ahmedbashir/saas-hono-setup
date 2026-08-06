import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import { db, eq, user as userTable, member as memberTable } from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";

// Proves packages/core/src/auth/permissions.ts's `member`/`invitation` grants actually
// work end to end through Better Auth's own organization plugin routes (invite-member,
// accept-invitation, remove-member, update-member-role — all proxied through the
// existing authRoutes catch-all, no custom controller of ours to unit test instead).
// Before this fix, the custom `statement`/`roles` this app passes to the `organization`
// plugin REPLACED Better Auth's defaults and never re-granted these two resources, so
// every role — including owner — was silently denied on all four routes. See
// specs/customer-portal-plan.md's "Team management" gap and
// packages/core/src/auth/permissions.ts's own doc comment.

const PORT = 8814;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
const cleanupUserIds: string[] = [];
const cleanupOrgIds: string[] = [];

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Org Permissions Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

async function createOrg(ownerCookie: string, name: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/organization/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
    body: JSON.stringify({
      name,
      slug: `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`,
    }),
  });
  const org = (await res.json()) as { id: string };
  return org.id;
}

beforeAll(() => {
  server = serve({ fetch: app.fetch, port: PORT });
});

afterAll(async () => {
  for (const orgId of cleanupOrgIds) {
    await db.delete(memberTable).where(eq(memberTable.organizationId, orgId));
  }
  for (const userId of cleanupUserIds) {
    await db.delete(userTable).where(eq(userTable.id, userId));
  }
  await new Promise((resolve) => server.close(resolve));
});

describe("Organization member/invitation permissions", () => {
  it("lets an owner invite someone by email, and that person accept and become a member", async () => {
    const owner = await signUp(`org-perms-owner-invite-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Invite Round Trip Org");
    cleanupOrgIds.push(orgId);

    const inviteeEmail = `org-perms-invitee-${Date.now()}@example.com`;
    const inviteRes = await fetch(`http://localhost:${PORT}/api/auth/organization/invite-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
      body: JSON.stringify({ organizationId: orgId, email: inviteeEmail, role: "member" }),
    });
    expect(inviteRes.status).toBe(200);
    const invitation = (await inviteRes.json()) as { id: string; email: string };
    expect(invitation.email.toLowerCase()).toBe(inviteeEmail.toLowerCase());

    // accept-invitation requires the accepting session's email to exactly match the
    // invitation's email (verified against crud-invites.mjs) — sign up as that exact
    // person, not an arbitrary account, to prove the real accept path, not just the invite.
    const invitee = await signUp(inviteeEmail);
    cleanupUserIds.push(invitee.userId);

    const acceptRes = await fetch(
      `http://localhost:${PORT}/api/auth/organization/accept-invitation`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: invitee.cookie },
        body: JSON.stringify({ invitationId: invitation.id }),
      },
    );
    expect(acceptRes.status).toBe(200);

    const [memberRow] = await db
      .select()
      .from(memberTable)
      .where(eq(memberTable.userId, invitee.userId));
    expect(memberRow?.organizationId).toBe(orgId);
    expect(memberRow?.role).toBe("member");
  }, 20000);

  it("lets an owner remove a member and update another member's role", async () => {
    const owner = await signUp(`org-perms-owner-manage-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Owner Manage Org");
    cleanupOrgIds.push(orgId);

    const toRemoveEmail = `org-perms-to-remove-${Date.now()}@example.com`;
    const toRemove = await signUp(toRemoveEmail);
    cleanupUserIds.push(toRemove.userId);
    await auth.api.addMember({
      body: { userId: toRemove.userId, role: "member", organizationId: orgId },
    });

    const toPromote = await signUp(`org-perms-to-promote-${Date.now()}@example.com`);
    cleanupUserIds.push(toPromote.userId);
    const promotedMember = await auth.api.addMember({
      body: { userId: toPromote.userId, role: "member", organizationId: orgId },
    });

    // memberIdOrEmail resolves by the `member` row's own id when it isn't shaped like an
    // email (verified against crud-members.mjs) — a user id doesn't match either lookup,
    // so this uses the email instead of `toRemove.userId`.
    const removeRes = await fetch(`http://localhost:${PORT}/api/auth/organization/remove-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
      body: JSON.stringify({ organizationId: orgId, memberIdOrEmail: toRemoveEmail }),
    });
    expect(removeRes.status).toBe(200);
    const [removedRow] = await db
      .select()
      .from(memberTable)
      .where(eq(memberTable.userId, toRemove.userId));
    expect(removedRow).toBeUndefined();

    const updateRoleRes = await fetch(
      `http://localhost:${PORT}/api/auth/organization/update-member-role`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: owner.cookie },
        body: JSON.stringify({
          organizationId: orgId,
          memberId: promotedMember.id,
          role: "admin",
        }),
      },
    );
    expect(updateRoleRes.status).toBe(200);
    const [promotedRow] = await db
      .select()
      .from(memberTable)
      .where(eq(memberTable.userId, toPromote.userId));
    expect(promotedRow?.role).toBe("admin");
  }, 20000);

  // The negative direction — required per specs/customer-portal-plan.md's Testing
  // Strategy: proving owner/admin are allowed isn't enough, a plain member must be
  // proven denied too, or the fix could have accidentally granted `member` everything.
  // Targets a third plain-member account, not the owner — removing/demoting the
  // organization's only owner hits Better Auth's own "can't leave without an owner"
  // guard before the permission check ever runs, which would test the wrong thing.
  it("rejects a plain member's attempt to invite, remove, or change another member's role", async () => {
    const owner = await signUp(`org-perms-owner-guard-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, "Member Guard Org");
    cleanupOrgIds.push(orgId);

    const plainMember = await signUp(`org-perms-plain-member-${Date.now()}@example.com`);
    cleanupUserIds.push(plainMember.userId);
    await auth.api.addMember({
      body: { userId: plainMember.userId, role: "member", organizationId: orgId },
    });

    const bystanderEmail = `org-perms-bystander-${Date.now()}@example.com`;
    const bystander = await signUp(bystanderEmail);
    cleanupUserIds.push(bystander.userId);
    const bystanderMember = await auth.api.addMember({
      body: { userId: bystander.userId, role: "member", organizationId: orgId },
    });

    const inviteRes = await fetch(`http://localhost:${PORT}/api/auth/organization/invite-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: plainMember.cookie },
      body: JSON.stringify({
        organizationId: orgId,
        email: `org-perms-denied-invite-${Date.now()}@example.com`,
        role: "member",
      }),
    });
    expect(inviteRes.status).toBe(403);

    // Better Auth's remove-member throws its permission-denied case as APIError
    // "UNAUTHORIZED" specifically (not "FORBIDDEN", unlike invite/update-role) — verified
    // directly against the installed plugin's crud-members.mjs and better-call's
    // UNAUTHORIZED: 401 status mapping, not assumed to match the other two routes.
    const removeRes = await fetch(`http://localhost:${PORT}/api/auth/organization/remove-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: plainMember.cookie },
      body: JSON.stringify({ organizationId: orgId, memberIdOrEmail: bystanderEmail }),
    });
    expect(removeRes.status).toBe(401);

    const updateRoleRes = await fetch(
      `http://localhost:${PORT}/api/auth/organization/update-member-role`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: ORIGIN,
          Cookie: plainMember.cookie,
        },
        body: JSON.stringify({
          organizationId: orgId,
          memberId: bystanderMember.id,
          role: "admin",
        }),
      },
    );
    expect(updateRoleRes.status).toBe(403);

    // Confirms none of the three denied calls actually mutated anything.
    const [bystanderRow] = await db
      .select()
      .from(memberTable)
      .where(eq(memberTable.userId, bystander.userId));
    expect(bystanderRow?.role).toBe("member");
  }, 20000);
});
