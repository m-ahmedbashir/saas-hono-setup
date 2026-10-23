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

  it.each(["/profile", "/billing", "/team", "/organization/new", "/organization/settings"])(
    "redirects an unauthenticated %s request to /auth/sign-in",
    (path) => {
      getSessionCookieMock.mockReturnValue(null);
      const request = new NextRequest(`http://localhost:3002${path}`);

      const response = proxy(request);

      expect(response?.headers.get("location")).toBe("http://localhost:3002/auth/sign-in");
    },
  );

  it("lets an authenticated /profile request through", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/profile");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  it("redirects an authenticated user away from /auth/sign-in to /profile", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/auth/sign-in");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBe("http://localhost:3002/profile");
  });

  it("redirects an authenticated user away from /auth/sign-up to /profile", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/auth/sign-up");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBe("http://localhost:3002/profile");
  });

  it("lets an unauthenticated request through to /auth/sign-in", () => {
    getSessionCookieMock.mockReturnValue(null);
    const request = new NextRequest("http://localhost:3002/auth/sign-in");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  // accept-invite must work for an already-signed-in existing member accepting an
  // invitation to a *second* org, not just a brand-new signup — the generic "already
  // signed in, bounce away from /auth/**" rule would otherwise incorrectly redirect them
  // straight to /profile before they ever get to accept. See proxy.ts's own comment.
  it("lets an authenticated user reach /auth/accept-invite instead of bouncing them to /profile", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/auth/accept-invite?id=inv_123");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  // A reset link opened in a browser that's still signed in must still work — the token,
  // not the session, decides whose password changes.
  it("lets an authenticated user reach /auth/reset-password", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/auth/reset-password?token=tok_1");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  // Verifying signs the user in, so the verify link lands here with a fresh session.
  it("lets an authenticated user reach /auth/email-verified", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/auth/email-verified");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });

  it("still sends a signed-in user away from /auth/forgot-password", () => {
    getSessionCookieMock.mockReturnValue("session-token-value");
    const request = new NextRequest("http://localhost:3002/auth/forgot-password");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBe("http://localhost:3002/profile");
  });

  it("leaves an unrelated public route alone regardless of session state", () => {
    getSessionCookieMock.mockReturnValue(null);
    const request = new NextRequest("http://localhost:3002/about");

    const response = proxy(request);

    expect(response?.headers.get("location")).toBeNull();
  });
});
