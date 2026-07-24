import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { etag } from "hono/etag";
import { authRoutes } from "./modules/auth/auth.routes";
import { billingRoutes } from "./modules/billing/billing.routes";
import { profileRoutes } from "./modules/profile/profile.routes";
import { organizationProfileRoutes } from "./modules/organization-profile/organization-profile.routes";
import { accountRoutes } from "./modules/account/account.routes";
import { createNotificationsRoutes } from "./modules/notifications/notifications.routes";
import { allowedOrigins } from "./lib/allowed-origins";
import { failure } from "./lib/response";
import { healthCheckHandler, notFoundHandler, globalErrorHandler } from "./lib/app-handlers";

export const app = new Hono()
  .use("*", logger())
  .use(
    "*",
    secureHeaders({
      strictTransportSecurity: "max-age=15552000; includeSubDomains",
      xFrameOptions: "DENY",
    }),
  )
  .use(
    "*",
    cors({
      origin: (origin) => (allowedOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
      maxAge: 600,
    }),
  )
  .use(
    "*",
    bodyLimit({
      maxSize: 5 * 1024 * 1024,
      onError: (c) => failure(c, "PAYLOAD_TOO_LARGE", "Payload exceeds safe processing size", 413),
    }),
  )
  .use("*", etag())
  .get("/health", healthCheckHandler)
  .route("/api/auth", authRoutes)
  .route("/billing", billingRoutes)
  .route("/profile", profileRoutes)
  .route("/organization-profile", organizationProfileRoutes)
  .route("/account", accountRoutes);

export const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.route("/ws", createNotificationsRoutes(upgradeWebSocket));

app.notFound(notFoundHandler);

app.onError(globalErrorHandler);

export type AppType = typeof app;
