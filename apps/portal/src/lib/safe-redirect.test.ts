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

  it("falls back to the default when there's no redirect at all", () => {
    expect(safeRedirectPath(undefined)).toBe("/profile");
    expect(safeRedirectPath(null)).toBe("/profile");
    expect(safeRedirectPath("")).toBe("/profile");
  });
});
