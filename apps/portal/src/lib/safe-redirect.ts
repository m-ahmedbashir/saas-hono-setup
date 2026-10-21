const DEFAULT_PATH = "/profile";

/**
 * Where to send the browser after sign-in/sign-up, from an untrusted `?redirect=` value
 * (e.g. the accept-invite page sending a signed-out visitor through sign-in and back).
 * Only same-site paths are honored — anything else falls back to the default. Rejected:
 * absolute URLs, protocol-relative `//host` and `/\host` (browsers treat both as another
 * host), and schemes like `javascript:` — otherwise this would be an open redirect a
 * phishing link could ride on.
 */
export function safeRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return DEFAULT_PATH;
  }
  return value;
}
