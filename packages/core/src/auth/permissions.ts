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
