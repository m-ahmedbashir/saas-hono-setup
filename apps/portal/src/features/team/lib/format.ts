export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

const roleLabels: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

export function roleLabel(role: string): string {
  return roleLabels[role] ?? role;
}
