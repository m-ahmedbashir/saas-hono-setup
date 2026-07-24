import { createAccessControl } from "better-auth/plugins/access";

export const statement = {
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
  billing: ["manage"],
  organizationProfile: ["manage"],
  // Owner-only, not granted to adminRole — permanently destroying the organization (and
  // every member's access to it) is more severe than anything organizationProfile:manage
  // covers, so it gets its own, stricter permission rather than reusing that one.
  organization: ["delete"],
} as const;

export const accessControl = createAccessControl(statement);

export const memberRole = accessControl.newRole({
  progress: ["read"],
  exercise: ["read"],
});

export const adminRole = accessControl.newRole({
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
  billing: ["manage"],
  organizationProfile: ["manage"],
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
  organization: ["delete"],
});

/**
 * Role name → Role object, the single source of truth for both the organization
 * plugin's `roles` config (`auth/index.ts`) and `requirePermission`'s in-process
 * permission check (`middleware/permission.middleware.ts`) — previously duplicated as
 * an inline object literal in the former; extracted so there's exactly one place this
 * mapping is defined.
 */
export const roles = { owner: ownerRole, member: memberRole, admin: adminRole };
