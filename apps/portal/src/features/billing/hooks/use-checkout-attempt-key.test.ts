import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCheckoutAttemptKey } from "./use-checkout-attempt-key";

// specs/billing-integrity-plan.md's Fix 2, proven rather than assumed: one key per
// logical attempt, reused across retries, never re-minted per call or per render.
describe("useCheckoutAttemptKey", () => {
  it("returns the same key for repeated calls about the same attempt", () => {
    const { result } = renderHook(() => useCheckoutAttemptKey());
    const first = result.current("pro");
    expect(result.current("pro")).toBe(first);
  });

  it("keeps the key stable across re-renders", () => {
    const { result, rerender } = renderHook(() => useCheckoutAttemptKey());
    const first = result.current("pro");
    rerender();
    expect(result.current("pro")).toBe(first);
  });

  it("mints a new key when the attempt changes", () => {
    const { result } = renderHook(() => useCheckoutAttemptKey());
    const pro = result.current("pro:5");
    expect(result.current("pro:6")).not.toBe(pro);
  });

  it("never shares keys between separate component instances (separate attempts)", () => {
    const a = renderHook(() => useCheckoutAttemptKey());
    const b = renderHook(() => useCheckoutAttemptKey());
    expect(a.result.current("pro")).not.toBe(b.result.current("pro"));
  });
});
