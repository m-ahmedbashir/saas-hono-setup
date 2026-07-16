import { Hono } from "hono";
import { auth } from "@repo/core/auth";

export const authRoutes = new Hono().on(["POST", "GET"], "/**", (c) => {
  return auth.handler(c.req.raw);
});
