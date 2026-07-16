import { createAccessControl } from "better-auth/plugins/access";

export const statement = {
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
} as const;

export const accessControl = createAccessControl(statement);

export const memberRole = accessControl.newRole({
  progress: ["read"],
  exercise: ["read"],
});

export const adminRole = accessControl.newRole({
  progress: ["read", "write"],
  exercise: ["create", "read", "update", "delete"],
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
});
