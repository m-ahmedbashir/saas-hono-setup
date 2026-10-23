import { hc } from "hono/client";
// Type-only: client-types.ts has no runtime code, so no server code can reach the bundle.
import type { AppType } from "@repo/api/client-types";

const baseUrl = process.env.NEXT_PUBLIC_API_URL;

// Every call to apps/api goes through this client, so request/response types come from the
// server's own routes (AppType) instead of hand-written copies. Points straight at apps/api,
// no Next.js proxy, with the session cookie on every request — same as authClient.
//
// Don't add `headers` to `init`: hc spreads `init` after the headers it builds, so it would
// replace them all (including the JSON Content-Type). Pass per-call `{ headers }` instead.
export const api = hc<AppType>(baseUrl ?? "", {
  init: { credentials: "include" },
  // Checked per call, not at import — CI's `next build` runs without this var, and a
  // missing one should name itself rather than fail later as an unrelated TypeError.
  fetch: (input: RequestInfo | URL, init?: RequestInit) => {
    if (!baseUrl) {
      return Promise.reject(new Error("NEXT_PUBLIC_API_URL is not set — see .env.example"));
    }
    return fetch(input, init);
  },
});
