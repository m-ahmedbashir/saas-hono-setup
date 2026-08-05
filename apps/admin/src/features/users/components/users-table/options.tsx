// Matches packages/core/src/auth/platform-permissions.ts's two platform tiers exactly —
// not the org-level roles from packages/core/src/auth/permissions.ts, a different,
// unrelated concept (see AGENTS.md's Platform admin section).
export const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "support", label: "Support" },
];
