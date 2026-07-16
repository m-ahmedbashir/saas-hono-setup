import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { authRoutes } from "./modules/auth/auth.routes";
import { injectUserContext } from "./middleware/auth.middleware";
import { requirePermission } from "./middleware/permission.middleware";

const app = new Hono()
  .route("/api/auth", authRoutes)
  .use("/protected/*", injectUserContext)
  .get("/protected/read", requirePermission({ progress: ["read"] }), (c) => c.json({ ok: true, check: "read" }))
  .get("/protected/write", requirePermission({ progress: ["write"] }), (c) => c.json({ ok: true, check: "write" }));

serve({ fetch: app.fetch, port: 8799 }, (info) => {
  console.log(`test server listening on ${info.port}`);
});
