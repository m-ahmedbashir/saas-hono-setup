/** Up to two initials for an avatar fallback, e.g. "Ada Lovelace" → "AL". "?" for a blank name. */
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
