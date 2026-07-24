import { randomInt } from "node:crypto";
import { organizationProfile } from "./schema";
import { eq } from "drizzle-orm";
import type { DbExecutor } from "./index";

// Lives here rather than packages/core (Domain, where a pure generator like this would
// normally belong) because packages/core already depends on @repo/db (for Better Auth's
// drizzleAdapter — see AGENTS.md's DIP exception), so the reverse import would be a
// circular workspace dependency. Same constraint already documented on
// organizationBilling's `plan` column above in schema.ts.

// Excludes visually ambiguous characters (0/O, 1/I/L) so a code is safe to read aloud or
// transcribe by hand. 31 characters, 8-char codes → 31^8 ≈ 852 billion combinations —
// collisions are handled below (retry on the DB's own UNIQUE violation), not just made
// astronomically unlikely and ignored.
const ORG_NUMBER_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ORG_NUMBER_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 5;

/**
 * A permanent, human-friendly, low-sensitivity identifier for an organization.
 * Cryptographically random (`randomInt`, not `Math.random`), matching how this repo
 * generates every other identifier-adjacent secret. Deliberately NOT intended to double
 * as a join/invite credential — see AGENTS.md's Organization Profile section for why
 * those need to stay separate concepts.
 */
function generateOrgNumber(): string {
  let code = "";
  for (let i = 0; i < ORG_NUMBER_LENGTH; i++) {
    code += ORG_NUMBER_ALPHABET[randomInt(ORG_NUMBER_ALPHABET.length)];
  }
  return code;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === "23505";
}

/**
 * Get-or-create, used two ways: eagerly, from the `afterCreateOrganization` Better Auth
 * hook (packages/core/src/auth/index.ts) so a new org's number exists immediately; and
 * defensively, from the organization-profile routes (apps/api), so an org created before
 * this feature existed — or any other edge case where the hook didn't run — still gets a
 * row the first time its profile is touched. Idempotent either way. Retries on a genuine
 * `orgNumber` collision (Postgres error 23505) rather than assuming one can't happen.
 *
 * Each insert attempt runs inside a SAVEPOINT (`tx.transaction(...)` on a Postgres
 * transaction creates one, not a fresh top-level transaction — confirmed against
 * drizzle-orm's node-postgres driver), not directly on `tx` — Postgres aborts an entire
 * transaction after any failed statement until it's rolled back, so retrying more
 * statements straight on `tx` after a unique-violation would just fail again with
 * "current transaction is aborted." Rolling back to the savepoint instead keeps the
 * caller's outer transaction (e.g. `withOrgScope`'s RLS-scoped one) usable afterward.
 */
export async function ensureOrganizationProfileRow(tx: DbExecutor, organizationId: string) {
  const [existing] = await tx
    .select()
    .from(organizationProfile)
    .where(eq(organizationProfile.organizationId, organizationId));
  if (existing) return existing;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    try {
      return await tx.transaction(async (savepoint) => {
        const [created] = await savepoint
          .insert(organizationProfile)
          .values({ id: crypto.randomUUID(), organizationId, orgNumber: generateOrgNumber() })
          .returning();
        return created!;
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;

      // Either orgNumber collided (rare — regenerate and retry) or a concurrent caller
      // already created this org's row (organizationId collided) — tell them apart by
      // checking for the row now, instead of assuming which one happened.
      const [raceWinner] = await tx
        .select()
        .from(organizationProfile)
        .where(eq(organizationProfile.organizationId, organizationId));
      if (raceWinner) return raceWinner;
      if (attempt === MAX_GENERATION_ATTEMPTS) throw err;
    }
  }
  throw new Error("unreachable");
}
