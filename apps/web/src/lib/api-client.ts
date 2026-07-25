// Shared fetch wrapper for apps/api — every feature's data hook goes through this
// instead of a raw fetch(...) call, so the base URL, credentials, and error-envelope
// parsing exist in exactly one place. Matches apps/api's real response shape (verified
// against packages/core/src/errors.ts and apps/api/src/lib/response.ts, not guessed):
// { success: true, data } / { success: false, error: { code, message, details? } }.
// Doesn't apply to Better Auth calls — those go through src/lib/auth-client.ts, which
// has its own { data, error } contract and its own cookie handling.

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

function isFailureBody(body: unknown): body is ApiFailureBody {
  return (
    typeof body === "object" &&
    body !== null &&
    "success" in body &&
    (body as { success: unknown }).success === false &&
    "error" in body
  );
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
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
