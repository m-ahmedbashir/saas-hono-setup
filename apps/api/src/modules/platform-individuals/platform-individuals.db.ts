import {
  user,
  profile,
  individualBilling,
  member,
  organization,
  eq,
  and,
  or,
  count,
  desc,
  inArray,
  notInArray,
  isNull,
  ilike,
  type DbExecutor,
} from "@repo/db";
import { platformRoles } from "@repo/core/auth/platform-permissions";

const PLATFORM_STAFF_ROLES = Object.keys(platformRoles);

// "Non-staff" is the complement of the existing Users (staff) page — not simply
// "role is null". Every regular signup/org-member gets `role: "user"` from Better
// Auth by default (confirmed earlier fixing the Users page's own scoping bug), but a
// bare `notInArray` alone would still be wrong for any row where role genuinely IS
// null: SQL's `NULL NOT IN (...)` evaluates to NULL (unknown), which a WHERE clause
// treats as false — silently excluding exactly the rows that most need including.
// Both branches are required for this to actually mean "everyone but staff".
const isNonStaff = or(isNull(user.role), notInArray(user.role, PLATFORM_STAFF_ROLES));

function searchFilter(search?: string) {
  if (!search) return isNonStaff;
  return and(isNonStaff, or(ilike(user.name, `%${search}%`), ilike(user.email, `%${search}%`)));
}

export interface PlatformIndividualRow {
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
}

// Must run inside withSystemScope (platform-individuals.service.ts) — `profile` and
// `individual_billing` are both RLS-enabled (FORCE ROW LEVEL SECURITY, migrations
// 0008 and 0004+0005), fail-closed to zero rows without either a user-scoped
// `set_config` or the system bypass flag set. `user` itself has no RLS policy
// (Better-Auth-generated, see AGENTS.md), so it's queryable either way — joining it
// in the same transaction is simpler than a separate connection.
export async function listIndividualsPage(
  tx: DbExecutor,
  limit: number,
  offset: number,
  search?: string,
): Promise<PlatformIndividualRow[]> {
  return tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      createdAt: user.createdAt,
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth,
      plan: individualBilling.plan,
      subscriptionStatus: individualBilling.subscriptionStatus,
    })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .leftJoin(individualBilling, eq(individualBilling.userId, user.id))
    .where(searchFilter(search))
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset(offset);
}

// Same filter as listIndividualsPage, applied independently — pagination's `total`
// must reflect the filtered count, not the whole table's.
export async function countIndividuals(tx: DbExecutor, search?: string): Promise<number> {
  const [row] = await tx.select({ value: count() }).from(user).where(searchFilter(search));
  return row?.value ?? 0;
}

export interface PlatformIndividualDetailRow {
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
}

// The `isNonStaff` filter here is what makes a staff user id 404 instead of leaking
// their profile/billing through this view — same partition as the list, not just
// hidden from it.
export async function getIndividualDetail(
  tx: DbExecutor,
  userId: string,
): Promise<PlatformIndividualDetailRow | undefined> {
  const [row] = await tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth,
      addressStreet: profile.addressStreet,
      addressCity: profile.addressCity,
      addressState: profile.addressState,
      addressPostalCode: profile.addressPostalCode,
      addressCountry: profile.addressCountry,
      plan: individualBilling.plan,
      subscriptionStatus: individualBilling.subscriptionStatus,
      providerCustomerId: individualBilling.providerCustomerId,
      providerSubscriptionId: individualBilling.providerSubscriptionId,
    })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .leftJoin(individualBilling, eq(individualBilling.userId, user.id))
    .where(and(eq(user.id, userId), isNonStaff));

  return row;
}

export interface IndividualOrganizationMembership {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: string;
}

// Deliberately never joined into listIndividualsPage/getIndividualDetail directly —
// `member` has no unique constraint per userId, so a plain join would duplicate a
// person into multiple result rows the moment they're in 2+ orgs, silently corrupting
// pagination (limit/offset/total all wrong). Same fix as
// platform-organizations.db.ts's getOwnersAndMemberCounts: one extra query, scoped to
// just the relevant user ids, grouped by the caller.
export async function getOrganizationMemberships(
  tx: DbExecutor,
  userIds: string[],
): Promise<IndividualOrganizationMembership[]> {
  if (userIds.length === 0) return [];

  return tx
    .select({
      userId: member.userId,
      organizationId: organization.id,
      organizationName: organization.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(inArray(member.userId, userIds));
}
