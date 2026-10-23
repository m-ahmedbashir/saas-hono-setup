import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { InferResponseType } from "hono/client";

// Mocks only global fetch — the client itself (URL building, init merging) runs for real.
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response(JSON.stringify({ success: true, data: {} })),
);

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("api (hc<AppType> client)", () => {
  it("calls apps/api at NEXT_PUBLIC_API_URL with the session cookie", async () => {
    const { api } = await import("./api");

    await api.billing.organization.$get();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test/billing/organization");
    expect(init?.credentials).toBe("include");
  });

  it("sends per-call headers (e.g. Idempotency-Key) alongside the JSON body and cookie", async () => {
    const { api } = await import("./api");

    await api.billing["individual-checkout"].$post(
      { json: { planId: "pro" } },
      { headers: { "Idempotency-Key": "k1" } },
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toBe("k1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ planId: "pro" }));
    expect(init?.credentials).toBe("include");
  });

  // A missing build-time env var must name itself, not surface as hc's internal TypeError —
  // and only when a call is made, so importing (e.g. during `next build`) still works.
  it("fails a call with a clear error when NEXT_PUBLIC_API_URL is unset, without fetching", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
    const { api } = await import("./api");

    await expect(api.billing.organization.$get()).rejects.toThrow("NEXT_PUBLIC_API_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("types responses from apps/api's AppType, not a hand-written copy", () => {
    type Api = (typeof import("./api"))["api"];
    type Data = InferResponseType<Api["billing"]["organization"]["$get"], 200>["data"];

    expectTypeOf<Data>().toHaveProperty("plan").toEqualTypeOf<string>();
    expectTypeOf<Data>().toHaveProperty("seatQuantity").toEqualTypeOf<number | null>();
    // @ts-expect-error — no such field on the server's response; compiles only if inference collapsed to any
    expectTypeOf<Data>().toHaveProperty("notAField");
  });
});
