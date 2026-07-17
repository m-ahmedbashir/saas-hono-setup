import { describe, it, expect, afterEach } from "vitest";
import { Hono } from "hono";
import { testClient } from "hono/testing";
import { AppError } from "@repo/core";
import { success, failure } from "./response";

const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

function buildTestApp() {
  const app = new Hono()
    .get("/ok", (c) => success(c, { hello: "world" }))
    .get("/fail", (c) => failure(c, "VALIDATION_ERROR", "bad input", 422, { field: "email" }))
    .get("/boom", (_c): ReturnType<typeof success> => {
      throw new AppError("FORBIDDEN", "nope", { reason: "test" });
    });

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return failure(c, err.code, err.message, err.status as 403, err.details);
    }
    throw err;
  });

  return app;
}

describe("success()", () => {
  it("wraps data in the success envelope with status 200 by default", async () => {
    const client = testClient(buildTestApp());
    const res = await client.ok.$get();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { hello: "world" } });
  });
});

describe("failure()", () => {
  it("wraps an error in the failure envelope with the given status", async () => {
    const client = testClient(buildTestApp());
    const res = await client.fail.$get();

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toBe("bad input");
  });

  it("includes details when NODE_ENV is not production", async () => {
    process.env.NODE_ENV = "development";
    const client = testClient(buildTestApp());
    const res = await client.fail.$get();

    const body = await res.json();
    expect(body.error.details).toEqual({ field: "email" });
  });

  it("omits details when NODE_ENV is production", async () => {
    process.env.NODE_ENV = "production";
    const client = testClient(buildTestApp());
    const res = await client.fail.$get();

    const body = await res.json();
    expect(body.error.details).toBeUndefined();
  });
});

describe("AppError formatting via onError", () => {
  it("formats a thrown AppError using its own code and status", async () => {
    const client = testClient(buildTestApp());
    const res = await client.boom.$get();

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({
      success: false,
      error: { code: "FORBIDDEN", message: "nope", details: { reason: "test" } },
    });
  });
});
