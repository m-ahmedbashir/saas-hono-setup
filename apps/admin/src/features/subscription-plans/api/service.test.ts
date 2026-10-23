import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createSubscriptionPlan,
  getSubscriptionPlan,
  getSubscriptionPlans,
  updateSubscriptionPlan,
} from "./service";

// Mocks only global fetch — the service, client and envelope unwrapping run for real. Pins
// the exact requests sent, so swapping the transport can't silently change them.
const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function sent(index = 0) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return {
    url: String(url),
    method: init?.method ?? "GET",
    headers: new Headers(init?.headers),
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    credentials: init?.credentials,
  };
}

const features = {
  priority_support: true,
  advanced_analytics: false,
  api_access: true,
  custom_branding: false,
};
const limits = { maxProjects: 3, maxApiRequestsPerMonth: 1000 };

describe("subscription-plans service", () => {
  it("lists plans with the filters as query params, forwarding a server-side cookie", async () => {
    fetchMock.mockResolvedValue(ok({ plans: [] }));

    const result = await getSubscriptionPlans(
      { ownerType: "organization", isActive: false },
      { Cookie: "session=abc" },
    );

    expect(result).toEqual({ plans: [] });
    const req = sent();
    expect(req.url).toBe(
      "http://localhost:8787/subscription-plans?ownerType=organization&isActive=false",
    );
    expect(req.method).toBe("GET");
    expect(req.headers.get("Cookie")).toBe("session=abc");
    expect(req.credentials).toBe("include");
  });

  it("omits unset filters", async () => {
    fetchMock.mockResolvedValue(ok({ plans: [] }));

    await getSubscriptionPlans({});

    expect(sent().url).toMatch(/^http:\/\/localhost:8787\/subscription-plans\??$/);
  });

  it("gets one plan by id", async () => {
    fetchMock.mockResolvedValue(ok({ id: "p1", activeSubscriberCount: 2 }));

    const result = await getSubscriptionPlan("p1");

    expect(result).toMatchObject({ id: "p1", activeSubscriberCount: 2 });
    expect(sent().url).toBe("http://localhost:8787/subscription-plans/p1");
  });

  it("creates a plan with a JSON POST", async () => {
    fetchMock.mockResolvedValue(ok({ id: "p1" }));
    const payload = {
      ownerType: "organization" as const,
      planId: "growth",
      name: "Growth",
      features,
      limits,
      isActive: true,
      isDefault: false,
    };

    await createSubscriptionPlan(payload);

    const req = sent();
    expect(req.url).toBe("http://localhost:8787/subscription-plans");
    expect(req.method).toBe("POST");
    expect(req.headers.get("Content-Type")).toBe("application/json");
    expect(req.body).toEqual(payload);
  });

  it("updates a plan with a JSON PATCH to its id", async () => {
    fetchMock.mockResolvedValue(ok({ id: "p1" }));
    const payload = { name: "Growth", features, limits, isActive: true, isDefault: false };

    await updateSubscriptionPlan("p1", payload);

    const req = sent();
    expect(req.url).toBe("http://localhost:8787/subscription-plans/p1");
    expect(req.method).toBe("PATCH");
    expect(req.body).toEqual(payload);
  });

  it("surfaces the API's error envelope as an ApiError with its code", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, error: { code: "FORBIDDEN", message: "Nope" } }),
        { status: 403 },
      ),
    );

    await expect(getSubscriptionPlan("p1")).rejects.toMatchObject({
      name: "ApiError",
      code: "FORBIDDEN",
      status: 403,
    });
  });
});
