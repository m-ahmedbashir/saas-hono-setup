/** A Better Auth error, keeping its machine-readable `code` (e.g. INVITATION_LIMIT_REACHED) so callers can branch on it rather than on message text. */
export class AuthActionError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code: string | undefined) {
    super(message);
    this.name = "AuthActionError";
    this.code = code;
  }
}

// authClient calls resolve { data, error } and never throw for expected failures —
// normalized into a thrown error here so TanStack Query's mutation error state works.
export function unwrapAuthResult<T>(result: {
  data: T | null;
  error: { message?: string; code?: string } | null;
}): T {
  if (result.error) {
    throw new AuthActionError(result.error.message ?? "Request failed", result.error.code);
  }
  if (result.data === null) {
    throw new AuthActionError("Request returned no data", undefined);
  }
  return result.data;
}

/** User-facing text for a failed Better Auth call — a friendly message for a known code, otherwise Better Auth's own. */
export function describeAuthError(error: Error, friendlyMessages: Record<string, string>): string {
  const code = error instanceof AuthActionError ? error.code : undefined;
  return (code && friendlyMessages[code]) || error.message;
}
