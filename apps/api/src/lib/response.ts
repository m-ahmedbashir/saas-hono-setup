import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorCode } from "@repo/core";

export const isDev = () => process.env.NODE_ENV !== "production";

export function success<T>(c: Context, data: T, status: 200 | 201 = 200) {
  return c.json({ success: true as const, data }, status);
}

export function failure(
  c: Context,
  code: ErrorCode | "HTTP_ERROR",
  message: string,
  status: ContentfulStatusCode,
  details?: unknown,
) {
  return c.json(
    {
      success: false as const,
      error: {
        code,
        message,
        ...(isDev() && details !== undefined ? { details } : {}),
      },
    },
    status,
  );
}
