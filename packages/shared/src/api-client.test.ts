import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch, ApiError } from "./api-client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonResponse(body: unknown, status: number) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

// Mocks only the real I/O boundary (global fetch) — everything else (envelope
// unwrapping, error mapping) runs for real against realistic response shapes.
describe("apiFetch", () => {
  it("returns the unwrapped data on a successful envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { id: "org_1" } }, 200));

    const result = await apiFetch<{ id: string }>("/organization");

    expect(result).toEqual({ id: "org_1" });
  });

  it("always sends credentials so the session cookie is included", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: null }, 200));

    await apiFetch("/organization");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("prefixes the path with NEXT_PUBLIC_API_URL", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: null }, 200));

    await apiFetch("/organization");

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(`${process.env.NEXT_PUBLIC_API_URL}/organization`);
  });

  it("throws an ApiError carrying the envelope's code, message, and HTTP status on failure", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: { code: "FORBIDDEN", message: "Insufficient permissions" } },
        403,
      ),
    );

    await expect(apiFetch("/organization")).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
      status: 403,
    });
  });

  it("still throws a usable ApiError when the failure body isn't the expected envelope shape", async () => {
    fetchMock.mockResolvedValue(jsonResponse("<html>Internal Server Error</html>", 500));

    await expect(apiFetch("/organization")).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 500,
    });
  });

  it("treats a failure body with a null or malformed error as an unknown failure, not a crash", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: null }, 500));
    await expect(apiFetch("/organization")).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 500,
    });

    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: "boom" }, 500));
    await expect(apiFetch("/organization")).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 500,
    });
  });

  // Callers may pass headers as a Headers instance or as [name, value] pairs, both valid
  // RequestInit forms — e.g. billing's Idempotency-Key must reach the server either way.
  it("keeps caller headers whatever form they're passed in, alongside the JSON content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: null }, 200));

    await apiFetch("/billing", { headers: new Headers({ "Idempotency-Key": "k1" }) });
    await apiFetch("/billing", { headers: [["Idempotency-Key", "k2"]] });
    await apiFetch("/billing", { headers: { "Idempotency-Key": "k3" } });

    const sent = fetchMock.mock.calls.map(([, init]) => new Headers((init as RequestInit).headers));
    expect(sent.map((h) => h.get("Idempotency-Key"))).toEqual(["k1", "k2", "k3"]);
    expect(sent.every((h) => h.get("Content-Type") === "application/json")).toBe(true);
  });

  it("lets a caller override the content type", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: null }, 200));

    await apiFetch("/upload", { headers: { "Content-Type": "text/plain" } });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Content-Type")).toBe("text/plain");
  });

  it("rejects with an ApiError, not a generic Error, so callers can branch on .code", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: { code: "NOT_FOUND", message: "Not found" } }, 404),
    );

    await expect(apiFetch("/organization")).rejects.toBeInstanceOf(ApiError);
  });
});
