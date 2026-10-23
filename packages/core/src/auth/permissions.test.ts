import { describe, it, expect } from "vitest";
import { roles } from "./permissions";

const can = (role: keyof typeof roles, action: "update" | "transfer-ownership" | "delete") =>
  roles[role].authorize({ organization: [action] }).success;

describe("organization permissions", () => {
  it("lets owners and admins rename the organization, not members", () => {
    expect(can("owner", "update")).toBe(true);
    expect(can("admin", "update")).toBe(true);
    expect(can("member", "update")).toBe(false);
  });

  it("lets only owners transfer ownership", () => {
    expect(can("owner", "transfer-ownership")).toBe(true);
    expect(can("admin", "transfer-ownership")).toBe(false);
    expect(can("member", "transfer-ownership")).toBe(false);
  });

  it("still lets only owners delete the organization", () => {
    expect(can("owner", "delete")).toBe(true);
    expect(can("admin", "delete")).toBe(false);
    expect(can("member", "delete")).toBe(false);
  });
});
