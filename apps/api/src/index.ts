import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { etag } from "hono/etag";
import { authRoutes } from "./modules/auth/auth.routes";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3000").split(",");

const app = new Hono()
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
      onError: (c) => c.json({ error: "Payload exceeds safe processing size" }, 413),
    })
  )
  .use("*", etag())
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api/auth", authRoutes);

export type AppType = typeof app;

const port = Number(process.env.PORT ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});
