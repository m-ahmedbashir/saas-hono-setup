import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  inArray,
  withOrgScope,
  user as userTable,
  member as memberTable,
  organization as organizationTable,
  subscriptionPlans as plansTable,
} from "@repo/db";
import { auth } from "@repo/core/auth";
import { app } from "../../app";
import { getDefaultPlanId } from "../subscription-plans/subscription-plans.service";
import { ensureBillingRow, updateBillingByOrgId } from "../billing/organization-billing.db";

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
const cleanupPlanIds: string[] = [];

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
  if (cleanupPlanIds.length > 0) {
    await db.delete(plansTable).where(inArray(plansTable.id, cleanupPlanIds));
  }
  for (const orgId of cleanupOrgIds) {
    await db.delete(memberTable).where(eq(memberTable.organizationId, orgId));
  }
  // Cascades each org's billing row, custom plans and invitations too.
  if (cleanupOrgIds.length > 0) {
    await db.delete(organizationTable).where(inArray(organizationTable.id, cleanupOrgIds));
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

// Seat limits are enforced by Better Auth's own hooks, wired in packages/core's auth config
// to apps/api's getOrganizationSeatUsage: `invitationLimit` stops inviting more people than
// there are free seats, and `membershipLimit` is checked on every accepted invitation and
// every addMember — so there's no path to joining past the limit.
describe("Organization seat limit", () => {
  async function invite(ownerCookie: string, organizationId: string, email: string) {
    return fetch(`http://localhost:${PORT}/api/auth/organization/invite-member`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: ownerCookie },
      body: JSON.stringify({ organizationId, email, role: "member" }),
    });
  }

  async function accept(cookie: string, invitationId: string) {
    return fetch(`http://localhost:${PORT}/api/auth/organization/accept-invitation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify({ invitationId }),
    });
  }

  // A seat deal for one org only: a custom plan reusing the default plan's slug replaces
  // the shared default for that org (custom-then-shared precedence) — no billing row
  // changes, nothing shared touched. The slug is looked up, not assumed to be "free".
  async function giveOrgSeatLimit(organizationId: string, seatLimit: number) {
    const id = crypto.randomUUID();
    cleanupPlanIds.push(id);
    await db.insert(plansTable).values({
      id,
      ownerType: "organization",
      planId: await getDefaultPlanId("organization"),
      organizationId,
      name: `${seatLimit} Seats`,
      seatLimit,
      isActive: true,
      isDefault: false,
    });
    return id;
  }

  async function newOrg(label: string) {
    const owner = await signUp(`org-seats-${label}-owner-${Date.now()}@example.com`);
    cleanupUserIds.push(owner.userId);
    const orgId = await createOrg(owner.cookie, `Seat ${label} Org`);
    cleanupOrgIds.push(orgId);
    return { owner, orgId };
  }

  it("refuses an invitation once every free seat is already taken or invited", async () => {
    const { owner, orgId } = await newOrg("invite");
    await giveOrgSeatLimit(orgId, 2);

    // Owner holds 1 of 2 seats, so exactly one invitation can be outstanding.
    expect(
      (await invite(owner.cookie, orgId, `org-seats-a-${Date.now()}@example.com`)).status,
    ).toBe(200);
    const refused = await invite(owner.cookie, orgId, `org-seats-b-${Date.now()}@example.com`);
    const body = (await refused.json()) as { code?: string };
    expect(refused.status).toBe(403);
    expect(body.code).toBe("INVITATION_LIMIT_REACHED");
  }, 30000);

  it("refuses to let anyone join past the limit, even holding an invitation sent before it dropped", async () => {
    const { owner, orgId } = await newOrg("accept");
    const planRowId = await giveOrgSeatLimit(orgId, 3);

    const firstEmail = `org-seats-first-${Date.now()}@example.com`;
    const secondEmail = `org-seats-second-${Date.now()}@example.com`;
    const firstInvitation = (await (await invite(owner.cookie, orgId, firstEmail)).json()) as {
      id: string;
    };
    const secondInvitation = (await (await invite(owner.cookie, orgId, secondEmail)).json()) as {
      id: string;
    };

    // The deal shrinks to 2 seats (a downgrade) after both invitations went out.
    await db.update(plansTable).set({ seatLimit: 2 }).where(eq(plansTable.id, planRowId));

    const first = await signUp(firstEmail);
    cleanupUserIds.push(first.userId);
    expect((await accept(first.cookie, firstInvitation.id)).status).toBe(200);

    const second = await signUp(secondEmail);
    cleanupUserIds.push(second.userId);
    const refused = await accept(second.cookie, secondInvitation.id);
    const body = (await refused.json()) as { code?: string };
    expect(refused.status).toBe(403);
    expect(body.code).toBe("ORGANIZATION_MEMBERSHIP_LIMIT_REACHED");

    // The server-side path is gated by the same hook, not just the HTTP accept route —
    // asserted by its exact code, so an unrelated failure can't pass for it.
    await expect(
      auth.api.addMember({
        body: { userId: second.userId, role: "member", organizationId: orgId },
      }),
    ).rejects.toMatchObject({ body: { code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" } });

    const members = await db
      .select()
      .from(memberTable)
      .where(eq(memberTable.organizationId, orgId));
    expect(members).toHaveLength(2);
  }, 30000);

  // Seat-based billing: the plan's seatLimit is the most an org *could* buy, the
  // subscription's quantity is what it *did* buy. Letting members in up to the plan's
  // limit while Stripe bills for fewer seats would be a revenue leak.
  it("caps members at the seats a live subscription paid for, below the plan's limit", async () => {
    const { orgId } = await newOrg("paid");
    await giveOrgSeatLimit(orgId, 10);
    await withOrgScope(orgId, async (tx) => {
      await ensureBillingRow(tx, orgId);
      await updateBillingByOrgId(tx, orgId, {
        providerSubscriptionId: `sub_seats_paid_${Date.now()}`,
        subscriptionStatus: "active",
        seatQuantity: 2,
      });
    });

    const joiner = await signUp(`org-seats-paid-joiner-${Date.now()}@example.com`);
    cleanupUserIds.push(joiner.userId);
    await auth.api.addMember({
      body: { userId: joiner.userId, role: "member", organizationId: orgId },
    });

    const extra = await signUp(`org-seats-paid-extra-${Date.now()}@example.com`);
    cleanupUserIds.push(extra.userId);
    await expect(
      auth.api.addMember({ body: { userId: extra.userId, role: "member", organizationId: orgId } }),
    ).rejects.toMatchObject({ body: { code: "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED" } });
  }, 30000);
});
