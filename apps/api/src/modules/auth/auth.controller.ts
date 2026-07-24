import type { Context } from "hono";
import { auth } from "@repo/core/auth";

export function proxyToAuthHandler(c: Context) {
  return auth.handler(c.req.raw);
}
