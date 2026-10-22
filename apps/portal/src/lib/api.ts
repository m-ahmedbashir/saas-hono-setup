import { hc } from "hono/client";
// Type-only: client-types.ts has no runtime code, so no server code can reach the bundle.
import type { AppType } from "@repo/api/client-types";

// Every call to apps/api goes through this client, so request/response types come from the
// server's own routes (AppType) instead of hand-written copies. Points straight at apps/api,
// no Next.js proxy, with the session cookie on every request — same as authClient.
export const api = hc<AppType>(process.env.NEXT_PUBLIC_API_URL!, {
  init: { credentials: "include" },
});
