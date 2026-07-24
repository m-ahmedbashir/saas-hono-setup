import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve, type ServerType } from "@hono/node-server";
import {
  db,
  eq,
  user as userTable,
  profile as profileTable,
  withSystemScope,
  withUserScope,
} from "@repo/db";
import { app } from "../../app";
import { ensureProfileRow } from "./profile.db";

// Hits the real dev database, same pattern as billing.integration.test.ts.

const PORT = 8804;
const ORIGIN = "http://localhost:3000";

let server: ServerType;
let userId: string;
let userCookie: string;

async function signUp(email: string) {
  const res = await fetch(`http://localhost:${PORT}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ email, password: "password1234", name: "Profile Test" }),
  });
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error("sign-up did not return a session cookie");
  return { userId: body.user.id, cookie: setCookie.split(";")[0]! };
}

beforeAll(async () => {
  server = serve({ fetch: app.fetch, port: PORT });

  const user = await signUp(`profile-test-${Date.now()}@example.com`);
  userId = user.userId;
  userCookie = user.cookie;
});

afterAll(async () => {
  await withSystemScope((tx) => tx.delete(profileTable).where(eq(profileTable.userId, userId)));
  await db.delete(userTable).where(eq(userTable.id, userId));
  await new Promise((resolve) => server.close(resolve));
});

describe("GET /profile", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`http://localhost:${PORT}/profile`, { headers: { Origin: ORIGIN } });
    expect(res.status).toBe(401);
  });

  it("returns an all-null profile before anything has been set (lazy row creation)", async () => {
    const res = await fetch(`http://localhost:${PORT}/profile`, {
      headers: { Origin: ORIGIN, Cookie: userCookie },
    });
    const body = (await res.json()) as { success: boolean; data: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      phone: null,
      dateOfBirth: null,
      address: { street: null, city: null, state: null, postalCode: null, country: null },
    });
  });
});

describe("PATCH /profile", () => {
  it("rejects a malformed body via the zValidator pre-route guard, in our envelope shape", async () => {
    const res = await fetch(`http://localhost:${PORT}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ phone: "not-a-phone-number" }),
    });
    const body = (await res.json()) as { success: boolean; error?: { code: string } };
    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error?.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a non-ISO-alpha-2 country code", async () => {
    const res = await fetch(`http://localhost:${PORT}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ address: { country: "USA" } }),
    });
    expect(res.status).toBe(422);
  });

  it("rejects a dateOfBirth in the future", async () => {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);

    const res = await fetch(`http://localhost:${PORT}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ dateOfBirth: nextYear.toISOString() }),
    });
    expect(res.status).toBe(422);
  });

  it("updates only the fields sent, leaving the rest unchanged (partial update)", async () => {
    const firstRes = await fetch(`http://localhost:${PORT}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({
        phone: "+15551234567",
        address: { city: "Metropolis", country: "US" },
      }),
    });
    const firstBody = (await firstRes.json()) as { data: Record<string, unknown> };
    expect(firstRes.status).toBe(200);
    expect(firstBody.data).toMatchObject({
      phone: "+15551234567",
      address: { city: "Metropolis", country: "US" },
    });

    const secondRes = await fetch(`http://localhost:${PORT}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ address: { street: "123 Main St" } }),
    });
    const secondBody = (await secondRes.json()) as { data: Record<string, unknown> };
    expect(secondRes.status).toBe(200);
    // phone and address.city/country from the first PATCH survive — omitted fields
    // mean "leave unchanged", not "clear".
    expect(secondBody.data).toMatchObject({
      phone: "+15551234567",
      address: { street: "123 Main St", city: "Metropolis", country: "US" },
    });
  });

  it("explicit null clears a field, distinct from omitting it", async () => {
    const res = await fetch(`http://localhost:${PORT}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: userCookie },
      body: JSON.stringify({ phone: null }),
    });
    const body = (await res.json()) as { data: Record<string, unknown> };
    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ phone: null });
  });
});

describe("Row-Level Security on the profile table", () => {
  // Same proof pattern as billing.integration.test.ts's RLS block — see its comment
  // for why this must be tested directly rather than trusted from the migration alone.
  // Self-contained (ensures its own row) rather than relying on an earlier test's side
  // effect, even though the PATCH tests above already create one.
  it("hides the row from an unscoped query, and from a different user's scope", async () => {
    await withSystemScope((tx) => ensureProfileRow(tx, userId));

    const unscoped = await db.select().from(profileTable).where(eq(profileTable.userId, userId));
    expect(unscoped).toEqual([]);

    const wrongUserScope = await withUserScope("some-other-user-id", (tx) =>
      tx.select().from(profileTable).where(eq(profileTable.userId, userId)),
    );
    expect(wrongUserScope).toEqual([]);

    const rightUserScope = await withUserScope(userId, (tx) =>
      tx.select().from(profileTable).where(eq(profileTable.userId, userId)),
    );
    expect(rightUserScope).toHaveLength(1);
  });
});
