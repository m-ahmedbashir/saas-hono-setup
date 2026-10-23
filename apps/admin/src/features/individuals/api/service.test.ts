import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks only the I/O boundaries: global fetch (apps/api) and authClient's network calls
// (Better Auth). The service, client and envelope unwrapping run for real.
const banUserMock = vi.fn();
const unbanUserMock = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    admin: {
      banUser: (...args: unknown[]) => banUserMock(...args),
      unbanUser: (...args: unknown[]) => unbanUserMock(...args),
    },
  },
}));

const { banIndividual, getPlatformIndividualDetail, getPlatformIndividuals, unbanIndividual } =
  await import("./service");

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }));

beforeEach(() => {
  fetchMock.mockReset();
  banUserMock.mockReset();
  unbanUserMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function sent(index = 0) {
  const [url, init] = fetchMock.mock.calls[index]!;
  return { url: String(url), headers: new Headers(init?.headers), credentials: init?.credentials };
}

const base = "http://localhost:8787/platform-individuals";

describe("platform-individuals service", () => {
  it("lists with every filter as query params, forwarding a server-side cookie", async () => {
    fetchMock.mockResolvedValue(ok({ individuals: [], total: 0 }));

    const result = await getPlatformIndividuals(
      {
        page: 2,
        limit: 25,
        search: "ada",
        plan: "individual_pro,individual_free",
        subscriptionStatus: "active,past_due",
        hasOrganization: false,
      },
      { Cookie: "session=abc" },
    );

    expect(result).toEqual({ individuals: [], total: 0 });
    const req = sent();
    const url = new URL(req.url);
    expect(`${url.origin}${url.pathname}`).toBe(base);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "2",
      limit: "25",
      search: "ada",
      plan: "individual_pro,individual_free",
      subscriptionStatus: "active,past_due",
      hasOrganization: "false",
    });
    expect(req.headers.get("Cookie")).toBe("session=abc");
    expect(req.credentials).toBe("include");
  });

  it("omits unset and empty filters", async () => {
    fetchMock.mockResolvedValue(ok({ individuals: [], total: 0 }));

    await getPlatformIndividuals({ search: "", plan: "" });

    expect(sent().url).toMatch(new RegExp(`^${base}\\??$`));
  });

  it("gets one individual's detail by user id", async () => {
    fetchMock.mockResolvedValue(ok({ id: "u_1", organizations: [], invoices: [] }));

    const result = await getPlatformIndividualDetail("u_1", { Cookie: "session=abc" });

    expect(result).toMatchObject({ id: "u_1" });
    expect(sent().url).toBe(`${base}/u_1`);
    expect(sent().headers.get("Cookie")).toBe("session=abc");
  });

  it("bans and unbans through Better Auth's admin client, surfacing its errors", async () => {
    banUserMock.mockResolvedValue({ data: { user: { id: "u_1" } }, error: null });
    unbanUserMock.mockResolvedValue({ data: null, error: { message: "Not allowed" } });

    await banIndividual("u_1", "fraud");
    await expect(unbanIndividual("u_1")).rejects.toThrow("Not allowed");

    expect(banUserMock).toHaveBeenCalledWith({ userId: "u_1", banReason: "fraud" });
    expect(unbanUserMock).toHaveBeenCalledWith({ userId: "u_1" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
