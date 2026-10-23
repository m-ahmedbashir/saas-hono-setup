import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { InferResponseType } from "hono/client";

// The client's own behaviour (cookie, headers, missing-URL error) is tested in
// @repo/shared's hc-client.test.ts; this proves admin wires it up correctly.
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

describe("api (admin's hc<AppType> client)", () => {
  it("calls apps/api at NEXT_PUBLIC_API_URL with the session cookie", async () => {
    const { api } = await import("./api");

    await api["subscription-plans"].$get({ query: { ownerType: "organization" } });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://api.test/subscription-plans?ownerType=organization");
    expect(init?.credentials).toBe("include");
  });

  it("types responses from apps/api's AppType, not a hand-written copy", () => {
    type Api = (typeof import("./api"))["api"];
    type Plan = InferResponseType<Api["subscription-plans"]["$get"], 200>["data"]["plans"][number];

    expectTypeOf<Plan>().toHaveProperty("planId").toEqualTypeOf<string>();
    // Dates arrive as JSON strings — the hand-written copy this replaces said Date.
    expectTypeOf<Plan>().toHaveProperty("createdAt").toEqualTypeOf<string>();
    // @ts-expect-error — no such field on the server's response; compiles only if inference collapsed to any
    expectTypeOf<Plan>().toHaveProperty("notAField");
  });
});
