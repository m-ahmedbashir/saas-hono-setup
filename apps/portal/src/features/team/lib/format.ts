const roleLabels: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}
