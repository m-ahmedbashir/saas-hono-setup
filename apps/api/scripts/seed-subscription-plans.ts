import { db, closePool, eq, and, isNull, subscriptionPlans } from "@repo/db";

// Idempotent — safe to re-run, and deliberately insert-only: once a plan row exists, an
// admin may have already edited its features/limits/price through the real UI this
// table now serves, so re-running this script must never clobber that. `subscriptionPlans`
// isn't RLS-enabled (global config, not owner-scoped data — see schema.ts's comment on
// the table), so the bare `db` client is correct here, same reasoning as seed-admin.ts.
//
// Seeds the same five plans that used to be the hardcoded organizationPlans/
// individualPlans + organizationPlanEntitlements/individualPlanEntitlements maps in
// packages/core/src/billing/{types,entitlements}.ts (now removed) — existing
// organization_billing.plan/individual_billing.plan string values keep resolving
// against these rows without any data migration on those tables.
const seedPlans = [
  {
    ownerType: "organization",
    planId: "free",
    name: "Free",
    seatLimit: 3,
    providerPriceId: null,
    features: {
      priority_support: false,
      advanced_analytics: false,
      api_access: false,
      custom_branding: false,
    },
    limits: { maxProjects: 3, maxApiRequestsPerMonth: 1_000 },
    isDefault: true,
  },
  {
    ownerType: "organization",
    planId: "starter",
    name: "Starter",
    seatLimit: 10,
    providerPriceId: process.env.STRIPE_PRICE_STARTER ?? null,
    features: {
      priority_support: false,
      advanced_analytics: true,
      api_access: true,
      custom_branding: false,
    },
    limits: { maxProjects: 20, maxApiRequestsPerMonth: 50_000 },
    isDefault: false,
  },
  {
    ownerType: "organization",
    planId: "growth",
    name: "Growth",
    seatLimit: 50,
    providerPriceId: process.env.STRIPE_PRICE_GROWTH ?? null,
    features: {
      priority_support: true,
      advanced_analytics: true,
      api_access: true,
      custom_branding: true,
    },
    limits: { maxProjects: 200, maxApiRequestsPerMonth: 500_000 },
    isDefault: false,
  },
  {
    ownerType: "individual",
    planId: "individual_free",
    name: "Individual Free",
    seatLimit: null,
    providerPriceId: null,
    features: {
      priority_support: false,
      advanced_analytics: false,
      api_access: false,
      custom_branding: false,
    },
    limits: { maxProjects: 1, maxApiRequestsPerMonth: 100 },
    isDefault: true,
  },
  {
    ownerType: "individual",
    planId: "individual_pro",
    name: "Individual Pro",
    seatLimit: null,
    providerPriceId: process.env.STRIPE_PRICE_INDIVIDUAL_PRO ?? null,
    features: {
      priority_support: true,
      advanced_analytics: true,
      api_access: true,
      custom_branding: false,
    },
    limits: { maxProjects: 10, maxApiRequestsPerMonth: 10_000 },
    isDefault: false,
  },
];

async function main() {
  for (const plan of seedPlans) {
    const [existing] = await db
      .select({ id: subscriptionPlans.id })
      .from(subscriptionPlans)
      .where(
        and(
          eq(subscriptionPlans.ownerType, plan.ownerType),
          eq(subscriptionPlans.planId, plan.planId),
          isNull(subscriptionPlans.organizationId),
        ),
      );

    if (existing) {
      console.log(`Already seeded: ${plan.ownerType}/${plan.planId} (${existing.id})`);
      continue;
    }

    const created = await db
      .insert(subscriptionPlans)
      .values({ id: crypto.randomUUID(), ...plan })
      .returning({ id: subscriptionPlans.id });
    console.log(`Seeded: ${plan.ownerType}/${plan.planId} (${created[0]!.id})`);
  }
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error(err);
    await closePool();
    process.exitCode = 1;
  });
