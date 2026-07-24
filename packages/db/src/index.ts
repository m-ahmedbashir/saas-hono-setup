import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

// No fallback to DATABASE_URL on purpose: that's the owner role (used only for
// migrations), which has BYPASSRLS on Neon by default — silently falling back to it
// here would make every Row-Level Security policy inert without any signal that
// happened. Fail loudly at boot instead. See AGENTS.md's Row-Level Security section.
if (!process.env.APP_DATABASE_URL) {
  throw new Error(
    "APP_DATABASE_URL is not set — the app's runtime DB connection must use a restricted " +
      "role (no BYPASSRLS), separate from DATABASE_URL's migration/owner role. See AGENTS.md.",
  );
}

const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export * from "./schema";
export { eq, count } from "drizzle-orm";

/** Whatever `db.transaction`'s callback receives — a `db`-shaped executor, scoped to one transaction. */
export type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `callback` inside a transaction scoped to one organization's Row-Level
 * Security context — every query the callback makes against an RLS-enabled table
 * only sees/touches rows belonging to `organizationId`. Use for anything acting on
 * behalf of an authenticated session (has a real `organizationId` to scope to).
 * See AGENTS.md's Row-Level Security section.
 *
 * `set_config(..., true)` (not raw `SET LOCAL` string interpolation) both scopes the
 * setting to this transaction only and passes `organizationId` as a bound parameter,
 * not string-concatenated SQL.
 */
export async function withOrgScope<T>(
  organizationId: string,
  callback: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_org_id', ${organizationId}, true)`);
    return callback(tx);
  });
}

/**
 * Same as `withOrgScope`, scoped by `userId` instead — for tables owned by an
 * individual rather than an organization (e.g. `user_billing`). Sets a *different*
 * session variable (`app.current_user_id`), so a single transaction could in principle
 * scope both if a query ever needed both an org and a user context — not currently
 * used that way, but the two are deliberately independent settings, not one shared key.
 */
export async function withUserScope<T>(
  userId: string,
  callback: (tx: DbExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId}, true)`);
    return callback(tx);
  });
}

/**
 * Runs `callback` inside a transaction that bypasses per-org RLS scoping entirely.
 * Only for contexts trusted through a *different* mechanism than a user session —
 * e.g. a Stripe webhook, whose trust boundary is its verified signature, not an
 * `organizationId` we'd otherwise scope to (a webhook event may not even name one,
 * e.g. `customer.subscription.updated` only carries a subscription id). Never use
 * this for anything reacting to a live user request.
 */
export async function withSystemScope<T>(callback: (tx: DbExecutor) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.bypass_rls', 'true', true)`);
    return callback(tx);
  });
}
