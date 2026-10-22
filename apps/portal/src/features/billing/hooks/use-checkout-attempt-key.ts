"use client";

import { useCallback, useRef } from "react";

/**
 * Idempotency keys for checkout, scoped to one *logical attempt* — specs/
 * billing-integrity-plan.md's Fix 2. `keyFor(attempt)` returns the same key for as long
 * as the caller keeps asking about the same attempt (every double-click and retry), and
 * mints a fresh one only when the attempt itself changes (a different plan, or for an
 * org a different seat count — Stripe rejects a reused key with different parameters).
 *
 * The key lives in a ref, created on first use, never inline in render or minted per
 * click — either would defeat the protection. Deliberately not derived from the attempt
 * string itself (e.g. a hash of planId): a later, genuinely new purchase of the same
 * plan would collide with a long-expired session.
 */
export function useCheckoutAttemptKey() {
  const current = useRef<{ attempt: string; key: string } | null>(null);

  return useCallback((attempt: string) => {
    if (current.current?.attempt !== attempt) {
      current.current = { attempt, key: crypto.randomUUID() };
    }
    return current.current.key;
  }, []);
}
