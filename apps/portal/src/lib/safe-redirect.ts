const DEFAULT_PATH = "/profile";
// A placeholder origin to resolve against — never visited, only compared.
const PROBE_ORIGIN = "https://same-site.invalid";

/**
 * Where to send the browser after sign-in/sign-up, from an untrusted `?redirect=` value
 * (e.g. the accept-invite page sending a signed-out visitor through sign-in and back).
 * Only same-site paths are honored; anything else falls back to the default.
 *
 * Decided by the WHATWG URL parser — the same rules the browser applies when it navigates
 * — not by string prefix checks: browsers strip tab/newline/CR and treat `\` like `/`, so
 * values like "/\t/evil.example" pass a "starts with / but not //" check yet still resolve
 * to another host. Resolving against a placeholder origin and requiring it unchanged
 * catches every such trick at once.
 *
 * The check is applied to the exact string returned, not only to the input: parsing also
 * removes dot segments, so "/.//evil.example" resolves same-site yet normalizes to the
 * protocol-relative "//evil.example". Whatever is returned must start with a single "/"
 * and resolve back to the same origin on its own.
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/")) return DEFAULT_PATH;

  let resolved: URL;
  try {
    resolved = new URL(value, PROBE_ORIGIN);
  } catch {
    return DEFAULT_PATH;
  }
  if (resolved.origin !== PROBE_ORIGIN) return DEFAULT_PATH;

  const path = `${resolved.pathname}${resolved.search}${resolved.hash}`;
  return isSameSitePath(path) ? path : DEFAULT_PATH;
}

function isSameSitePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return false;
  return new URL(path, PROBE_ORIGIN).origin === PROBE_ORIGIN;
}
