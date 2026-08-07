import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const getSessionCookieMock = vi.fn();
vi.mock("better-auth/cookies", () => ({
  getSessionCookie: (...args: unknown[]) => getSessionCookieMock(...args),
}));

// Mocks only the real I/O boundary (reading the session cookie) — everything else
// (path matching, redirect decision) runs for real against a real NextRequest.
describe("proxy", () => {
  beforeEach(() => {
    getSessionCookieMock.mockReset();
  });

  it("redirects an unauthenticated /dashboard request to /auth/sign-in", () => {
    getSessionCookieMock.mockReturnValue(null);
    const request = new NextRequest("http://localhost:3000/dashboard/overview");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBe("http://localhost:3000/auth/sign-in");
  });

  it("lets an authenticated /dashboard request through", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3000/dashboard/overview");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  it("redirects an authenticated user away from /auth/sign-in to the dashboard", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3000/auth/sign-in");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBe("http://localhost:3000/dashboard/overview");
  });

  it("lets an unauthenticated request through to /auth/sign-in", () => {
    getSessionCookieMock.mockReturnValue(null);
    const request = new NextRequest("http://localhost:3000/auth/sign-in");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  it("leaves an unrelated public route alone regardless of session state", () => {
    getSessionCookieMock.mockReturnValue(null);
    const request = new NextRequest("http://localhost:3000/about");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });
});
