import { withSystemScope } from "@repo/db";
import { AppError } from "@repo/core";
import {
  listIndividualsPage,
  countIndividuals,
  getIndividualDetail,
  getOrganizationMemberships,
} from "./platform-individuals.db";
import { listInvoicesByUserId } from "../billing/invoices.db";

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
  plan?: string[];
  subscriptionStatus?: string[];
  hasOrganization?: boolean;
}): Promise<ListPlatformIndividualsResult> {
  const offset = (params.page - 1) * params.limit;
  const filters = {
    search: params.search,
    plan: params.plan,
    subscriptionStatus: params.subscriptionStatus,
    hasOrganization: params.hasOrganization,
  };

  return withSystemScope(async (tx) => {
    const [rows, total] = await Promise.all([
      listIndividualsPage(tx, params.limit, offset, filters),
      countIndividuals(tx, filters),
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

export interface PlatformIndividualInvoice {
  id: string;
  planId: string;
  amountTotal: number;
  currency: string;
  status: string;
  receiptUrl: string | null;
  issuedAt: Date;
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
  invoices: PlatformIndividualInvoice[];
}

export async function getPlatformIndividualDetail(
  userId: string,
): Promise<PlatformIndividualDetail> {
  return withSystemScope(async (tx) => {
    const detail = await getIndividualDetail(tx, userId);
    if (!detail) {
      throw new AppError("NOT_FOUND", "Individual not found");
    }

    const [memberships, invoiceRows] = await Promise.all([
      getOrganizationMemberships(tx, [userId]),
      listInvoicesByUserId(tx, userId),
    ]);
    const organizations = memberships.map((membership) => ({
      id: membership.organizationId,
      name: membership.organizationName,
      role: membership.role,
    }));
    const invoices: PlatformIndividualInvoice[] = invoiceRows.map((row) => ({
      id: row.id,
      planId: row.planId,
      amountTotal: row.amountTotal,
      currency: row.currency,
      status: row.status,
      receiptUrl: row.receiptUrl,
      issuedAt: row.issuedAt,
    }));

    return { ...detail, organizations, invoices };
  });
}
