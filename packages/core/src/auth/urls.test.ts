import { describe, it, expect } from "vitest";
import { resolveAuthBaseUrl, resolvePortalUrl } from "./urls";

describe("resolvePortalUrl", () => {
  it("uses the configured URL, without a trailing slash", () => {
    expect(resolvePortalUrl({ PORTAL_URL: "https://app.example.com/" })).toBe(
      "https://app.example.com",
    );
  });

  it("defaults to the local portal outside production", () => {
    expect(resolvePortalUrl({ NODE_ENV: "development" })).toBe("http://localhost:3002");
  });

  it("refuses to start in production without one", () => {
    expect(() => resolvePortalUrl({ NODE_ENV: "production" })).toThrow(/PORTAL_URL/);
  });

  // Reset and verification links carry one-time tokens; plain http would expose them.
  it("refuses a non-https URL in production", () => {
    expect(() =>
      resolvePortalUrl({ NODE_ENV: "production", PORTAL_URL: "http://app.example.com" }),
    ).toThrow(/https/);
  });
});

describe("resolveAuthBaseUrl", () => {
  it("passes the configured URL through", () => {
    expect(
      resolveAuthBaseUrl({ NODE_ENV: "production", BETTER_AUTH_URL: "https://api.example.com" }),
    ).toBe("https://api.example.com");
  });

  it("allows it to be unset outside production", () => {
    expect(resolveAuthBaseUrl({ NODE_ENV: "development" })).toBeUndefined();
  });

  it("refuses to start in production without one", () => {
    expect(() => resolveAuthBaseUrl({ NODE_ENV: "production" })).toThrow(/BETTER_AUTH_URL/);
  });

  // Verification links point at the API's /verify-email with the token in the query string.
  it("refuses a non-https URL in production", () => {
    expect(() =>
      resolveAuthBaseUrl({ NODE_ENV: "production", BETTER_AUTH_URL: "http://api.example.com" }),
    ).toThrow(/https/);
  });
});
