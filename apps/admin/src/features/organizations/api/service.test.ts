import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  banOrganization,
  createPlatformOrganization,
  getPlatformOrganizationDetail,
  getPlatformOrganizations,
  unbanOrganization,
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

const base = "http://localhost:8787/platform-organizations";

describe("platform-organizations service", () => {
  it("lists organizations with paging/search as query params, forwarding a server-side cookie", async () => {
    fetchMock.mockResolvedValue(ok({ organizations: [], total: 0 }));

    const result = await getPlatformOrganizations(
      { page: 2, limit: 25, search: "acme" },
      { Cookie: "session=abc" },
    );

    expect(result).toEqual({ organizations: [], total: 0 });
    const req = sent();
    expect(req.url).toBe(`${base}?page=2&limit=25&search=acme`);
    expect(req.headers.get("Cookie")).toBe("session=abc");
    expect(req.credentials).toBe("include");
  });

  it("omits unset and empty filters", async () => {
    fetchMock.mockResolvedValue(ok({ organizations: [], total: 0 }));

    await getPlatformOrganizations({ search: "" });

    expect(sent().url).toMatch(new RegExp(`^${base}\\??$`));
  });

  it("gets one organization's detail by id", async () => {
    fetchMock.mockResolvedValue(ok({ id: "org_1", members: [], invoices: [] }));

    const result = await getPlatformOrganizationDetail("org_1", { Cookie: "session=abc" });

    expect(result).toMatchObject({ id: "org_1" });
    expect(sent().url).toBe(`${base}/org_1`);
    expect(sent().headers.get("Cookie")).toBe("session=abc");
  });

  it("creates an organization with its owner via a JSON POST", async () => {
    fetchMock.mockResolvedValue(ok({ organizationId: "org_1", ownerUserId: "u_1" }));
    const payload = {
      organizationName: "Acme",
      organizationSlug: "acme",
      ownerName: "Ada",
      ownerEmail: "ada@acme.test",
      ownerPassword: "correct-horse",
    };

    const result = await createPlatformOrganization(payload);

    expect(result).toEqual({ organizationId: "org_1", ownerUserId: "u_1" });
    const req = sent();
    expect(req.url).toBe(base);
    expect(req.method).toBe("POST");
    expect(req.headers.get("Content-Type")).toBe("application/json");
    expect(req.body).toEqual(payload);
  });

  it("bans with an optional reason as a JSON POST", async () => {
    // A fresh Response per call — a body can only be read once.
    fetchMock.mockImplementation(async () => ok({ organizationId: "org_1", suspended: true }));

    await banOrganization("org_1", "chargebacks");
    await banOrganization("org_1");

    expect(sent(0)).toMatchObject({
      url: `${base}/org_1/ban`,
      method: "POST",
      body: { reason: "chargebacks" },
    });
    expect(sent(1).body).toEqual({});
  });

  it("unbans with a POST", async () => {
    fetchMock.mockResolvedValue(ok({ organizationId: "org_1", suspended: false }));

    const result = await unbanOrganization("org_1");

    expect(result).toEqual({ organizationId: "org_1", suspended: false });
    expect(sent()).toMatchObject({ url: `${base}/org_1/unban`, method: "POST" });
  });
});
