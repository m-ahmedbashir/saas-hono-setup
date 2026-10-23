// Unwraps apps/api's response envelope — { success: true, data } / { success: false, error:
// { code, message, details? } } (apps/api/src/lib/response.ts) — for responses from each
// app's hc<AppType> client. The data type comes from the response's own typing, so it is
// inferred from the server's routes, never written by hand. Doesn't apply to Better Auth
// calls — those go through each app's auth-client.ts, which has its own { data, error }.
import type { ErrorCode as ServerErrorCode } from "@repo/core/errors";

// HTTP_ERROR: the response wasn't the envelope at all (a proxy's error page, an empty body).
export type ErrorCode = ServerErrorCode | "HTTP_ERROR";

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

// What unwrap needs from a response — satisfied by both a plain Response and hc's typed
// ClientResponse, whose json() is typed with the route's possible bodies.
interface JsonResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

// Distributes over hc's per-status union of responses and keeps only the success bodies'
// data — a failure body (e.g. a handler's own failure() call) never widens the result.
type SuccessData<R> = R extends { json(): Promise<infer Body> }
  ? Body extends { success: true; data: infer Data }
    ? Data
    : never
  : never;

interface FailureBody {
  success: false;
  error: { code: ErrorCode; message: string; details?: unknown };
}

// Checks the error's shape too, not just that the key exists — { success: false, error:
// null } would otherwise crash reading .code instead of falling through to HTTP_ERROR.
function isFailureBody(body: unknown): body is FailureBody {
  if (typeof body !== "object" || body === null) return false;
  const { success, error } = body as { success?: unknown; error?: unknown };
  if (success !== false || typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return typeof code === "string" && typeof message === "string";
}

function isSuccessBody(body: unknown): body is { success: true; data: unknown } {
  return (
    typeof body === "object" &&
    body !== null &&
    "data" in body &&
    (body as { success?: unknown }).success === true
  );
}

export async function unwrap<R extends JsonResponse>(res: R): Promise<SuccessData<R>> {
  // A non-JSON body must surface as a usable ApiError, not an unrelated parse error.
  const body: unknown = await res.json().catch(() => null);

  if (res.ok && isSuccessBody(body)) return body.data as SuccessData<R>;

  if (!res.ok && isFailureBody(body)) {
    throw new ApiError(body.error.code, body.error.message, res.status, body.error.details);
  }
  throw new ApiError("HTTP_ERROR", `Request failed with status ${res.status}`, res.status);
}
