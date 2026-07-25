import { createAuthClient } from "better-auth/react";
import { organizationClient, adminClient } from "better-auth/client/plugins";

// Points straight at apps/api — no Next.js route-handler proxy in between. Browser
// requests carry the session cookie automatically (`credentials: "include"` is the
// client's default), and apps/api's CORS already allows this origin with credentials
// (see AGENTS.md's Auth model section). organizationClient/adminClient mirror the two
// plugins actually registered on the server (packages/core/src/auth/index.ts) — a client
// plugin here that isn't registered server-side would just 404 on every call.
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [organizationClient(), adminClient()],
});

export const { useSession, signIn, signOut } = authClient;
