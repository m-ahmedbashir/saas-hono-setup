import { describe, it, expect, expectTypeOf } from "vitest";
import { ApiError, unwrap } from "./api-response";

function jsonResponse(body: unknown, status: number) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

// Real Response objects, the same thing hc's client hands back — nothing mocked.
describe("unwrap", () => {
  it("returns the envelope's data on success", async () => {
    const result = await unwrap(jsonResponse({ success: true, data: { id: "org_1" } }, 200));

    expect(result).toEqual({ id: "org_1" });
  });

  it("throws an ApiError carrying the envelope's code, message, status and details", async () => {
    const res = jsonResponse(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Insufficient permissions", details: { a: 1 } },
      },
      403,
    );

    await expect(unwrap(res)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Insufficient permissions",
      status: 403,
      details: { a: 1 },
    });
  });

  it("rejects with an ApiError, not a generic Error, so callers can branch on .code", async () => {
    const res = jsonResponse(
      { success: false, error: { code: "NOT_FOUND", message: "Not found" } },
      404,
    );

    await expect(unwrap(res)).rejects.toBeInstanceOf(ApiError);
  });

  it("still throws a usable ApiError when the failure body isn't the envelope (e.g. a proxy's HTML page)", async () => {
    await expect(unwrap(jsonResponse("<html>Bad Gateway</html>", 502))).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 502,
    });
  });

  it("treats a failure body with a null or malformed error as an unknown failure, not a crash", async () => {
    await expect(unwrap(jsonResponse({ success: false, error: null }, 500))).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 500,
    });
    await expect(
      unwrap(jsonResponse({ success: false, error: "boom" }, 500)),
    ).rejects.toMatchObject({ code: "HTTP_ERROR", status: 500 });
  });

  // A 2xx that isn't the envelope (empty body, intercepting proxy) must not resolve to
  // `undefined` typed as real data — the UI would then fail far from the cause.
  it("throws HTTP_ERROR on a 2xx response that isn't a success envelope", async () => {
    await expect(unwrap(jsonResponse("", 200))).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 200,
    });
    await expect(unwrap(jsonResponse({ id: "org_1" }, 200))).rejects.toMatchObject({
      code: "HTTP_ERROR",
      status: 200,
    });
  });

  it("infers the result from the success body only, ignoring failure bodies in the union", () => {
    type Typed = {
      ok: boolean;
      status: number;
      json(): Promise<
        | { success: true; data: { id: string } }
        | { success: false; error: { code: "FORBIDDEN"; message: string } }
      >;
    };

    expectTypeOf<ReturnType<typeof unwrap<Typed>>>().toEqualTypeOf<Promise<{ id: string }>>();
  });
});
