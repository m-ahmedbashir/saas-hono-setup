import { profile, eq, type DbExecutor } from "@repo/db";

// Every function here requires an explicit `tx` — a `withUserScope`/`withSystemScope`
// transaction executor from @repo/db, never the bare `db` client — same reasoning as
// organization-billing.db.ts/individual-billing.db.ts. See AGENTS.md's Row-Level
// Security section.

export async function getProfileByUserId(tx: DbExecutor, userId: string) {
  const [row] = await tx.select().from(profile).where(eq(profile.userId, userId));
  return row ?? null;
}

/** Creates an empty row if the user doesn't have one yet — every user gets exactly one, lazily. */
export async function ensureProfileRow(tx: DbExecutor, userId: string) {
  const existing = await getProfileByUserId(tx, userId);
  if (existing) return existing;

  const [created] = await tx
    .insert(profile)
    .values({ id: crypto.randomUUID(), userId })
    .returning();
  return created!;
}

interface ProfileUpdate {
  phone: string | null;
  dateOfBirth: Date | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
}

export async function updateProfileByUserId(
  tx: DbExecutor,
  userId: string,
  values: Partial<ProfileUpdate>,
) {
  await tx.update(profile).set(values).where(eq(profile.userId, userId));
}
