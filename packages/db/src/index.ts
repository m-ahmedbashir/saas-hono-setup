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

// node-postgres's own defaults are wrong for production: max: 10 caps this whole app
// (across every request that touches the DB) at 10 concurrent queries regardless of
// traffic, and connectionTimeoutMillis: 0 means a request waiting for a free connection
// waits forever instead of failing fast with a clear error. Made explicit and
// env-tunable rather than left implicit.
const pool = new Pool({
  connectionString: process.env.APP_DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT_MS ?? 30_000),
  connectionTimeoutMillis: Number(process.env.DB_POOL_CONNECTION_TIMEOUT_MS ?? 10_000),
});

// An idle pooled client can emit an unexpected 'error' event (e.g. the server dropped
// the connection) — pg's own docs warn that leaving this unhandled crashes the whole
// process, since an unhandled 'error' on any Node EventEmitter throws. Log and move on;
// the pool replaces the dead client on its own.
pool.on("error", (err) => {
  console.error("Unexpected error on idle Postgres client", err);
});

export const db = drizzle(pool, { schema });

/** For graceful shutdown (apps/api/src/index.ts) — closes every pooled connection. */
export async function closePool(): Promise<void> {
  await pool.end();
}

export * from "./schema";
export * from "./organization-profile";
export {
  eq,
  ne,
  and,
  or,
  count,
  desc,
  inArray,
  notInArray,
  isNull,
  ilike,
  exists,
  notExists,
} from "drizzle-orm";

/** Whatever `db.transaction`'s callback receives — a `db`-shaped executor, scoped to one transaction. */
export type DbExecutor = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Either the plain `db` client or a `DbExecutor` — for `.db.ts` functions querying a
 * table with no RLS policy at all (e.g. `member`/`organization`/`user`), where there's
 * no scope to get wrong either way. RLS-enabled tables should keep requiring the
 * stricter `DbExecutor` so a caller can't accidentally query them unscoped.
 */
export type AnyExecutor = typeof db | DbExecutor;

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
