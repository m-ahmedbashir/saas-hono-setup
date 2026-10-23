import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { PlatformUser } from "./types";

// Mocks only Better Auth's admin client (the network boundary) — the service's query
// building and error normalization run for real.
const admin = {
  listUsers: vi.fn(),
  createUser: vi.fn(),
  setRole: vi.fn(),
  banUser: vi.fn(),
  unbanUser: vi.fn(),
  removeUser: vi.fn(),
};
vi.mock("@/lib/auth-client", () => ({ authClient: { admin } }));

const service = await import("./service");

const user = {
  id: "u_1",
  name: "Ada",
  email: "ada@example.test",
  emailVerified: true,
  role: "support",
  banned: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

beforeEach(() => {
  for (const fn of Object.values(admin)) fn.mockReset();
});

describe("users service", () => {
  it("lists only platform users (admin/support), paged, forwarding headers with credentials", async () => {
    admin.listUsers.mockResolvedValue({ data: { users: [user], total: 1 }, error: null });

    const result = await service.getUsers({ page: 3, limit: 20 }, { Cookie: "session=abc" });

    expect(result).toEqual({ users: [user], total: 1 });
    expect(admin.listUsers).toHaveBeenCalledWith(
      {
        query: {
          limit: 20,
          offset: 40,
          filterField: "role",
          filterOperator: "in",
          filterValue: ["admin", "support"],
        },
      },
      { headers: { Cookie: "session=abc" }, credentials: "include" },
    );
  });

  it("narrows to one role, searches by name and sorts when asked", async () => {
    admin.listUsers.mockResolvedValue({ data: { users: [], total: 0 }, error: null });

    await service.getUsers({ role: "admin", search: "ad", sortBy: "name", sortDirection: "desc" });

    expect(admin.listUsers.mock.calls[0]![0]).toEqual({
      query: {
        limit: 10,
        offset: 0,
        searchField: "name",
        searchOperator: "contains",
        searchValue: "ad",
        filterField: "role",
        filterOperator: "eq",
        filterValue: "admin",
        sortBy: "name",
        sortDirection: "desc",
      },
    });
  });

  it("creates an employee with their platform role and returns the created user", async () => {
    admin.createUser.mockResolvedValue({ data: { user }, error: null });

    const created = await service.createEmployee({
      name: "Ada",
      email: "ada@example.test",
      password: "correct-horse",
      role: "support",
    });

    expect(created).toEqual(user);
    expect(admin.createUser).toHaveBeenCalledWith({
      name: "Ada",
      email: "ada@example.test",
      password: "correct-horse",
      role: "support",
    });
  });

  it("passes role/ban/unban/remove straight to Better Auth and throws its errors", async () => {
    admin.setRole.mockResolvedValue({ data: { user }, error: null });
    admin.banUser.mockResolvedValue({ data: { user }, error: null });
    admin.unbanUser.mockResolvedValue({ data: { user }, error: null });
    admin.removeUser.mockResolvedValue({ data: null, error: { message: "Cannot remove" } });

    await service.setUserRole("u_1", "admin");
    await service.banUser("u_1", "left the company");
    await service.unbanUser("u_1");
    await expect(service.removeUser("u_1")).rejects.toThrow("Cannot remove");

    expect(admin.setRole).toHaveBeenCalledWith({ userId: "u_1", role: "admin" });
    expect(admin.banUser).toHaveBeenCalledWith({ userId: "u_1", banReason: "left the company" });
    expect(admin.unbanUser).toHaveBeenCalledWith({ userId: "u_1" });
    expect(admin.removeUser).toHaveBeenCalledWith({ userId: "u_1" });
  });

  it("types rows from Better Auth's admin client, not a hand-written copy", () => {
    expectTypeOf<PlatformUser>().toHaveProperty("email").toEqualTypeOf<string>();
    expectTypeOf<PlatformUser>().toHaveProperty("createdAt").toEqualTypeOf<Date>();
    // @ts-expect-error — no such field on Better Auth's user; compiles only if inference collapsed to any
    expectTypeOf<PlatformUser>().toHaveProperty("notAField");
  });
});
