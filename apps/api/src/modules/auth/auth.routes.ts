import { Hono } from "hono";
import { proxyToAuthHandler } from "./auth.controller";

export const authRoutes = new Hono().on(["POST", "GET"], "/**", proxyToAuthHandler);
