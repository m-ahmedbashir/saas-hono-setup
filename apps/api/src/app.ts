import { createNodeWebSocket } from "@hono/node-ws";
import * as Sentry from "@sentry/hono/node";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { etag } from "hono/etag";
import { AppError } from "@repo/core";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";
import { createNotificationsRoutes } from "./modules/notifications/notifications.routes";
import { allowedOrigins } from "./lib/allowed-origins";
import { failure, isDev } from "./lib/response";

export const app = new Hono()
  .use("*", logger())
  .use(
    "*",
    secureHeaders({
      strictTransportSecurity: "max-age=15552000; includeSubDomains",
      xFrameOptions: "DENY",
    })
  )
  .use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      maxAge: 600,
    })
  )
  .use(
    "*",
    bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: (c) => failure(c, "PAYLOAD_TOO_LARGE", "Payload exceeds safe processing size", 413),
    })
  )
  .use("*", etag())
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api/auth", authRoutes)
  .route("/billing", billingRoutes);

export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route("/ws", createNotificationsRoutes(upgradeWebSocket));

app.notFound((c) => failure(c, "NOT_FOUND", "Not found", 404));

app.onError((err, c) => {
  if (err instanceof AppError) {
    return failure(c, err.code, err.message, err.status as ContentfulStatusCode, err.details);
  }

  if (err instanceof HTTPException) {
    return failure(c, "HTTP_ERROR", err.message, err.status, isDev() ? { stack: err.stack } : undefined);
  }

  console.error(err);
  Sentry.captureException(err);
  return failure(c, "INTERNAL_ERROR", "Something went wrong", 500, isDev() ? { message: err.message, stack: err.stack } : undefined);
});

export type AppType = typeof app;
