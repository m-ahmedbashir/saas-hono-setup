import { getPlatformOrganizations } from "@/features/organizations/api/service";
import { getPlatformIndividuals } from "@/features/individuals/api/service";
import { getStaff } from "@/features/staff/api/service";
import { getSubscriptionPlans } from "@/features/subscription-plans/api/service";

// Real counts off endpoints every other feature already has — no new apps/api routes.
// `getStaff` with no `role` filter already scopes to admin/support only (see its own
// service.ts comment), so this is a genuine "platform staff" count, not "every account".
export interface OverviewStats {
  staffTotal: number;
  organizationsTotal: number;
  individualsTotal: number;
  activePlansTotal: number;
}

export async function getOverviewStats(headers: HeadersInit): Promise<OverviewStats> {
  const [staff, organizations, individuals, plans] = await Promise.all([
    getStaff({ page: 1, limit: 1 }, headers),
    getPlatformOrganizations({ page: 1, limit: 1 }, headers),
    getPlatformIndividuals({ page: 1, limit: 1 }, headers),
    getSubscriptionPlans({ isActive: true }, headers),
  ]);

  return {
    staffTotal: staff.total,
    organizationsTotal: organizations.total,
    individualsTotal: individuals.total,
    // No `.total` on the plans response — it's the whole (unpaginated) list already,
    // see subscription-plans/api/types.ts.
    activePlansTotal: plans.plans.length,
  };
}

export interface RecentSignup {
  id: string;
  type: "organization" | "individual";
  name: string;
  email: string | null;
  createdAt: Date;
  href: string;
}

// Latest orgs + individuals merged by createdAt — both list endpoints already sort
// newest-first, so this is just two small fetches and a client-side sort, not a new
// aggregate endpoint.
export async function getRecentSignups(headers: HeadersInit, limit = 5): Promise<RecentSignup[]> {
  const [organizations, individuals] = await Promise.all([
    getPlatformOrganizations({ page: 1, limit }, headers),
    getPlatformIndividuals({ page: 1, limit }, headers),
  ]);

  const orgSignups: RecentSignup[] = organizations.organizations.map((org) => ({
    id: org.id,
    type: "organization",
    name: org.name,
    email: org.ownerEmail,
    createdAt: org.createdAt,
    href: `/dashboard/organizations/${org.id}`,
  }));

  const individualSignups: RecentSignup[] = individuals.individuals.map((individual) => ({
    id: individual.id,
    type: "individual",
    name: individual.name,
    email: individual.email,
    createdAt: individual.createdAt,
    href: `/dashboard/individuals/${individual.id}`,
  }));

  return [...orgSignups, ...individualSignups]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}
