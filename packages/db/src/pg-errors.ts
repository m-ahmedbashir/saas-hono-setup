type PgErrorFields = { code?: unknown; constraint?: unknown };

/**
 * Postgres unique violation (23505), optionally on one specific constraint. drizzle-orm
 * (>= 0.44) wraps every failed query in a `DrizzleQueryError` that carries the driver's
 * error on `.cause`, so a bare `err.code` check never matches — look through the wrapper.
 */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pgErr = (err instanceof Error && err.cause ? err.cause : err) as PgErrorFields | null;
  if (typeof pgErr !== "object" || pgErr === null || pgErr.code !== "23505") return false;
  return constraint === undefined || pgErr.constraint === constraint;
}
