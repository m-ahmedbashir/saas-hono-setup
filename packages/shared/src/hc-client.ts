// The one place both frontends build their typed apps/api client — each app passes its own
// AppType (`import type`, apps/api/src/client-types.ts), so request/response types come from
// the server's routes instead of hand-written copies. Points straight at apps/api, no Next.js
// proxy, with the session cookie on every request — same as each app's authClient.
// Unwrap responses with ./api-response's unwrap().
import { hc } from "hono/client";
import type { Hono } from "hono";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- hc's own constraint
export function createApiClient<App extends Hono<any, any, any>>(
  baseUrl: string | undefined,
): ReturnType<typeof hc<App>> {
  // Don't add `headers` to `init`: hc spreads `init` after the headers it builds, so it would
  // replace them all (including the JSON Content-Type). Pass per-call `{ headers }` instead.
  return hc<App>(baseUrl ?? "", {
    init: { credentials: "include" },
    // Checked per call, not at import — CI's `next build` runs without this var, and a
    // missing one should name itself rather than fail later as hc's internal TypeError.
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      if (!baseUrl) {
        return Promise.reject(new Error("NEXT_PUBLIC_API_URL is not set — see .env.example"));
      }
      return fetch(input, init);
    },
  });
}
