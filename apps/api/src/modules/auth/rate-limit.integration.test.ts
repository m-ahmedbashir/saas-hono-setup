import { randomInt } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { db, ilike, rateLimit as rateLimitTable } from "@repo/db";
import { auth, createAuth } from "@repo/core/auth";

// Better Auth rate limits only in production by default, so these build extra instances
// from the app's own config (createAuth) with limiting switched on. Two of them sharing
// the real database stand in for two API instances behind a load balancer. Requests go
// straight to each instance's handler — no server, no port.

const ORIGIN = "http://localhost:3000";
const SIGN_IN_LIMIT = 5;

const instanceA = createAuth({ rateLimitEnabled: true });
const instanceB = createAuth({ rateLimitEnabled: true });

// A distinct TEST-NET-3 address per simulated client; afterAll deletes their counters.
const usedIps: string[] = [];
function clientIp(): string {
  const ip = `203.0.113.${randomInt(1, 255)}`;
  if (usedIps.includes(ip)) return clientIp();
  usedIps.push(ip);
  return ip;
}

function signInAttempt(instance: typeof instanceA, ip: string) {
  return instance.handler(
    new Request(`${process.env.BETTER_AUTH_URL}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, "cf-connecting-ip": ip },
      body: JSON.stringify({ email: `nobody-${ip}@example.com`, password: "wrong-password-1" }),
    }),
  );
}

afterAll(async () => {
  for (const ip of usedIps) {
    await db.delete(rateLimitTable).where(ilike(rateLimitTable.key, `${ip}|%`));
  }
});

describe("Rate limiting", () => {
  it("is wired into the app's auth: shared database counters, keyed on cf-connecting-ip", () => {
    expect(auth.options.rateLimit?.storage).toBe("database");
    expect(auth.options.rateLimit?.customRules?.["/sign-in/email"]).toEqual({
      window: 60,
      max: SIGN_IN_LIMIT,
    });
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual(["cf-connecting-ip"]);
  });

  it("refuses a sign-in burst from one client once it passes the limit", async () => {
    const ip = clientIp();
    for (let i = 0; i < SIGN_IN_LIMIT; i++) {
      expect((await signInAttempt(instanceA, ip)).status).toBe(401);
    }
    const refused = await signInAttempt(instanceA, ip);
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("X-Retry-After"))).toBeGreaterThan(0);
  }, 30000);

  it("doesn't limit a second client because the first hit the limit", async () => {
    const noisy = clientIp();
    for (let i = 0; i <= SIGN_IN_LIMIT; i++) await signInAttempt(instanceA, noisy);
    expect((await signInAttempt(instanceA, noisy)).status).toBe(429);

    expect((await signInAttempt(instanceA, clientIp())).status).toBe(401);
  }, 30000);

  it("holds the limit across two instances sharing the database", async () => {
    const ip = clientIp();
    for (let i = 0; i < SIGN_IN_LIMIT; i++) {
      const instance = i % 2 === 0 ? instanceA : instanceB;
      expect((await signInAttempt(instance, ip)).status).toBe(401);
    }
    expect((await signInAttempt(instanceB, ip)).status).toBe(429);
    expect((await signInAttempt(instanceA, ip)).status).toBe(429);
  }, 30000);
});
