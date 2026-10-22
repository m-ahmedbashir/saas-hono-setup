import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps a same-site path, including its query string", () => {
    expect(safeRedirectPath("/auth/accept-invite?id=abc")).toBe("/auth/accept-invite?id=abc");
    expect(safeRedirectPath("/team")).toBe("/team");
  });

  it("falls back to the default for anything that could leave this site", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/profile");
    expect(safeRedirectPath("//evil.example")).toBe("/profile");
    expect(safeRedirectPath("/\\evil.example")).toBe("/profile");
    expect(safeRedirectPath("javascript:alert(1)")).toBe("/profile");
    expect(safeRedirectPath("team")).toBe("/profile");
  });

  // Browsers strip tab/newline/CR from URLs before resolving them, so "/\t/evil.example"
  // passes a naive "starts with / but not //" check and still navigates to evil.example.
  it("can't be bypassed by control characters a browser strips before resolving", () => {
    expect(safeRedirectPath("/\t/evil.example")).toBe("/profile");
    expect(safeRedirectPath("/\n/evil.example")).toBe("/profile");
    expect(safeRedirectPath("/\r/evil.example")).toBe("/profile");
    expect(safeRedirectPath("\t//evil.example")).toBe("/profile");
  });

  // Dot segments are removed while parsing, so these normalize to "//evil.example" —
  // the origin check on the parsed URL passes, but the *returned* path would leave the site.
  it("can't be bypassed by dot segments that normalize into a protocol-relative path", () => {
    expect(safeRedirectPath("/.//evil.example")).toBe("/profile");
    expect(safeRedirectPath("/..//evil.example")).toBe("/profile");
    expect(safeRedirectPath("/%2e//evil.example")).toBe("/profile");
    expect(safeRedirectPath("/a/..//evil.example")).toBe("/profile");
  });

  it("still allows ordinary paths that happen to contain dot segments", () => {
    expect(safeRedirectPath("/a/../team")).toBe("/team");
  });

  it("falls back to the default when there's no redirect at all", () => {
    expect(safeRedirectPath(undefined)).toBe("/profile");
    expect(safeRedirectPath(null)).toBe("/profile");
    expect(safeRedirectPath("")).toBe("/profile");
  });
});
