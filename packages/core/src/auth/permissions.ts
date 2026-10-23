import { createAccessControl } from "better-auth/plugins/access";

export const statement = {
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
  billing: ["manage"],
  organizationProfile: ["manage"],
  // `update` (owner+admin) is what Better Auth's own /organization/update checks to rename
  // (verified in the installed 1.7.12 crud-org.mjs) — without it even an owner is refused.
  // `delete` and `transfer-ownership` are owner-only: destroying the organization or
  // handing it over is more severe than anything organizationProfile:manage covers.
  organization: ["update", "delete", "transfer-ownership"],
  // Mirrors Better Auth's own default org statement's `member`/`invitation` resources
  // (verified against the installed plugin's access/statement.mjs) — this custom
  // statement REPLACED the plugin's defaults entirely (see the doc comment on ownerRole
  // below), which silently zeroed out invite/remove/role-change for every role,
  // including owner. Only these two resources are added back, not the plugin's `team`/`ac`
  // ones — nothing in this repo uses the Teams feature, and `ac` (managing the access
  // control config itself) isn't exposed to any role. Don't add either speculatively.
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
} as const;

export const accessControl = createAccessControl(statement);

export const memberRole = accessControl.newRole({
  progress: ["read"],
  exercise: ["read"],
  // No member/invitation grants — matches Better Auth's own default `memberAc`
  // (an ordinary org member can't invite/remove people or change roles).
});

export const adminRole = accessControl.newRole({
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
  billing: ["manage"],
  organizationProfile: ["manage"],
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

/**
 * Better Auth auto-assigns "owner" to whoever creates an organization.
 * Passing a custom `roles` map to the organization plugin REPLACES its
 * defaults rather than merging with them, so "owner" must be defined here
 * explicitly or an org's own creator ends up with zero permissions.
 */
export const ownerRole = accessControl.newRole({
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
  billing: ["manage"],
  organizationProfile: ["manage"],
  organization: ["update", "delete", "transfer-ownership"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
});

/**
 * Role name → Role object, the single source of truth for both the organization
 * plugin's `roles` config (`auth/index.ts`) and `requirePermission`'s in-process
 * permission check (`middleware/permission.middleware.ts`) — previously duplicated as
 * an inline object literal in the former; extracted so there's exactly one place this
 * mapping is defined.
 */
export const roles = { owner: ownerRole, member: memberRole, admin: adminRole };
