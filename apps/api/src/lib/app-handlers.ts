import type { Context } from "hono";
import * as Sentry from "@sentry/hono/node";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AppError } from "@repo/core";
import { failure, isDev } from "./response";

export function healthCheckHandler(c: Context) {
  return c.json({ status: "ok" });
}

export function notFoundHandler(c: Context) {
  return failure(c, "NOT_FOUND", "Not found", 404);
}

export function globalErrorHandler(err: Error, c: Context) {
  if (err instanceof AppError) {
    return failure(c, err.code, err.message, err.status as ContentfulStatusCode, err.details);
  }

  if (err instanceof HTTPException) {
    return failure(
      c,
      "HTTP_ERROR",
      err.message,
      err.status,
      isDev() ? { stack: err.stack } : undefined,
    );
  }

  console.error(err);
  Sentry.captureException(err);
  return failure(
    c,
    "INTERNAL_ERROR",
    "Something went wrong",
    500,
    isDev() ? { message: err.message, stack: err.stack } : undefined,
  );
}
