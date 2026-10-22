// Shared fetch wrapper for apps/api — every feature's data hook goes through this
// instead of a raw fetch(...) call, so the base URL, credentials, and error-envelope
// parsing exist in exactly one place. Matches apps/api's real response shape (verified
// against packages/core/src/errors.ts and apps/api/src/lib/response.ts, not guessed):
// { success: true, data } / { success: false, error: { code, message, details? } }.
// Doesn't apply to Better Auth calls — those go through each app's own auth-client.ts,
// which has its own { data, error } contract and its own cookie handling. Shared between
// apps/admin and apps/portal (see specs/customer-portal-plan.md's Architecture section) —
// this wrapper has zero audience-specific logic, unlike auth-client.ts's plugin set.

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "PAYMENT_REQUIRED"
  | "INTERNAL_ERROR"
  | "HTTP_ERROR";

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ApiFailureBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}

interface ApiSuccessBody<T> {
  success: true;
  data: T;
}

// Checks the error's shape too, not just that the key exists — a body like
// { success: false, error: null } would otherwise crash reading .code instead of falling
// through to the generic HTTP_ERROR below.
function isFailureBody(body: unknown): body is ApiFailureBody {
  if (typeof body !== "object" || body === null) return false;
  const { success, error } = body as { success?: unknown; error?: unknown };
  if (success !== false || typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

// RequestInit headers can be a plain object, a Headers instance, or [name, value] pairs —
// spreading only works for the first and silently drops the others (e.g. billing's
// Idempotency-Key). `new Headers()` accepts all three; JSON is the default content type,
// a caller-supplied one wins.
function buildHeaders(callerHeaders: HeadersInit | undefined): Headers {
  const headers = new Headers(callerHeaders);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return headers;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: buildHeaders(init?.headers),
  });

  // A malformed/non-JSON body (e.g. a proxy's raw HTML error page) must not crash this
  // wrapper — it should still surface as a usable ApiError, not an unrelated parse error.
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    if (isFailureBody(body)) {
      throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
    }
    throw new ApiError("HTTP_ERROR", `Request failed with status ${res.status}`, res.status);
  }

  return (body as ApiSuccessBody<T>).data;
}
