// The two public origins auth emails link to, checked once at startup. Reset and invite
// links go to the portal; verification links go to the API's GET /verify-email first. All
// of them carry one-time tokens, so in production both must be set and must be https.
// Failing at boot, never per request: a hook that failed only for some addresses would
// make known and unknown ones answer differently.

export function resolvePortalUrl(env: NodeJS.ProcessEnv): string {
  const configured = env.PORTAL_URL?.replace(/\/+$/, "");
  if (!configured) {
    if (env.NODE_ENV === "production") {
      throw new Error("PORTAL_URL must be set in production — auth emails link to the portal.");
    }
    return "http://localhost:3002";
  }
  requireHttpsInProduction("PORTAL_URL", configured, env);
  return configured;
}

/** Better Auth's `baseURL`; unset outside production, Better Auth infers it per request. */
export function resolveAuthBaseUrl(env: NodeJS.ProcessEnv): string | undefined {
  const configured = env.BETTER_AUTH_URL;
  if (!configured) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "BETTER_AUTH_URL must be set in production — verification links point at it.",
      );
    }
    return undefined;
  }
  requireHttpsInProduction("BETTER_AUTH_URL", configured, env);
  return configured;
}

function requireHttpsInProduction(name: string, url: string, env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production" && !url.startsWith("https://")) {
    throw new Error(`${name} must use https:// in production.`);
  }
}
