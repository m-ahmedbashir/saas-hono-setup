import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { createApiClient } from "./hc-client";

// A tiny real app, only so the client has route types to call — never served.
const _testApp = new Hono()
  .get("/billing/organization", (c) => c.json({ success: true as const, data: {} }))
  .post("/billing/checkout", (c) => c.json({ success: true as const, data: {} }));
type TestApp = typeof _testApp;

// Mocks only global fetch — the client itself (URL building, init merging) runs for real.
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
  async () => new Response(JSON.stringify({ success: true, data: {} })),
);

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

describe("createApiClient", () => {
  it("calls apps/api at the given base URL with the session cookie", async () => {
    const api = createApiClient<TestApp>("http://api.test");

    await api.billing.organization.$get();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test/billing/organization");
    expect(init?.credentials).toBe("include");
  });

  it("sends per-call headers (e.g. Idempotency-Key, a forwarded Cookie) alongside the JSON body", async () => {
    const api = createApiClient<TestApp>("http://api.test");

    await api.billing.checkout.$post(undefined, {
      headers: { "Idempotency-Key": "k1", Cookie: "session=abc" },
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const headers = new Headers(init?.headers);
    expect(headers.get("Idempotency-Key")).toBe("k1");
    expect(headers.get("Cookie")).toBe("session=abc");
    expect(init?.credentials).toBe("include");
  });

  // A missing build-time env var must name itself, not surface as hc's internal TypeError —
  // and only when a call is made, so importing (e.g. during `next build`) still works.
  it("fails a call with a clear error when the base URL is unset, without fetching", async () => {
    const api = createApiClient<TestApp>(undefined);

    await expect(api.billing.organization.$get()).rejects.toThrow("NEXT_PUBLIC_API_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
