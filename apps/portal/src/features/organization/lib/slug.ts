// Slugs are internal only (spec Open question 3): no URL uses them, so the user never
// sees or picks one — it's derived from the name and only has to be unique.
const MAX_SLUG_LENGTH = 48;
const SUFFIX_ATTEMPTS = 3;
const SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, "");
  return slug || "organization";
}

function randomSuffix(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length]).join("");
}

/** The slugs to try in order: the plain one, then a few with a random suffix in case it's taken. */
export function slugCandidates(base: string): string[] {
  return [base, ...Array.from({ length: SUFFIX_ATTEMPTS }, () => `${base}-${randomSuffix()}`)];
}
