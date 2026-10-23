import type { BetterAuthOptions } from "better-auth";

// Kept apart from index.ts (which constructs the live `auth` at import) so the
// rate-limit integration test can build extra Better Auth instances from the exact same
// options and prove the limit holds across API instances.

/**
 * Enabled in production only (Better Auth's default). Paths are relative to the auth
 * base path; these replace Better Auth's built-in defaults for the same paths.
 */
export const rateLimitOptions = {
  // Shared counters: with memory storage each API instance counts separately, so the real
  // limit would multiply by the instance count. Needs better-auth >= 1.7.7, whose atomic
  // consume() stops concurrent requests overshooting the limit (GHSA-44jh-23m7-hpcf).
  storage: "database",
  customRules: {
    "/sign-in/email": { window: 60, max: 5 },
    "/sign-up/email": { window: 60, max: 3 },
    "/request-password-reset": { window: 60, max: 5 },
    // The portal's "resend" button — unlimited, it would flood the address with email.
    "/send-verification-email": { window: 60, max: 3 },
  },
} satisfies BetterAuthOptions["rateLimit"];

/**
 * The client IP is the rate-limit key. Production sits behind Cloudflare, which always
 * overwrites `cf-connecting-ip` — trustworthy only because the origin accepts Cloudflare
 * traffic alone (see README's Deployment notes); a directly reachable origin would let a
 * client send its own header. A request without it shares one `no-trusted-ip` bucket.
 */
export const ipAddressOptions = {
  ipAddressHeaders: ["cf-connecting-ip"],
} satisfies NonNullable<BetterAuthOptions["advanced"]>["ipAddress"];
