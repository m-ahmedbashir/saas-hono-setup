import { withSystemScope } from "@repo/db";
import { AppError } from "@repo/core";
import {
  listIndividualsPage,
  countIndividuals,
  getIndividualDetail,
  getOrganizationMemberships,
} from "./platform-individuals.db";

export interface PlatformIndividualOrganization {
  id: string;
  name: string;
  role: string;
}

export interface PlatformIndividualSummary {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean | null;
  createdAt: Date;
  phone: string | null;
  dateOfBirth: Date | null;
  plan: string | null;
  subscriptionStatus: string | null;
  organizations: PlatformIndividualOrganization[];
}

export interface ListPlatformIndividualsResult {
  individuals: PlatformIndividualSummary[];
  total: number;
}

function groupMembershipsByUser(
  memberships: Awaited<ReturnType<typeof getOrganizationMemberships>>,
): Map<string, PlatformIndividualOrganization[]> {
  const byUserId = new Map<string, PlatformIndividualOrganization[]>();
  for (const membership of memberships) {
    const existing = byUserId.get(membership.userId) ?? [];
    existing.push({
      id: membership.organizationId,
      name: membership.organizationName,
      role: membership.role,
    });
    byUserId.set(membership.userId, existing);
  }
  return byUserId;
}

// withSystemScope, not a bare `db` client — `profile`/`individual_billing` are
// RLS-enabled and fail closed (zero rows) for any query that doesn't set either a
// user-scoped session var or the bypass flag. The trust boundary here is
// requirePlatformPermission (checked before this ever runs), the same "trusted
// through a different mechanism than a per-user session" reasoning withSystemScope's
// own doc comment describes for webhook processing — mirrors
// platform-organizations.service.ts exactly.
export async function listPlatformIndividuals(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<ListPlatformIndividualsResult> {
  const offset = (params.page - 1) * params.limit;

  return withSystemScope(async (tx) => {
    const [rows, total] = await Promise.all([
      listIndividualsPage(tx, params.limit, offset, params.search),
      countIndividuals(tx, params.search),
    ]);

    const memberships = await getOrganizationMemberships(
      tx,
      rows.map((row) => row.id),
    );
    const byUserId = groupMembershipsByUser(memberships);

    const individuals: PlatformIndividualSummary[] = rows.map((row) => ({
      ...row,
      organizations: byUserId.get(row.id) ?? [],
    }));

    return { individuals, total };
  });
}

export interface PlatformIndividualDetail {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
  phone: string | null;
  dateOfBirth: Date | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  organizations: PlatformIndividualOrganization[];
}

export async function getPlatformIndividualDetail(
  userId: string,
): Promise<PlatformIndividualDetail> {
  return withSystemScope(async (tx) => {
    const detail = await getIndividualDetail(tx, userId);
    if (!detail) {
      throw new AppError("NOT_FOUND", "Individual not found");
    }

    const memberships = await getOrganizationMemberships(tx, [userId]);
    const organizations = memberships.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
      role: membership.role,
    }));

    return { ...detail, organizations };
  });
}
