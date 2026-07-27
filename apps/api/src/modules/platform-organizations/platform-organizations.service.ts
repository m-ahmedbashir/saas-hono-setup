import { db, withSystemScope } from "@repo/db";
import { auth, isAPIError } from "@repo/core/auth";
import { AppError } from "@repo/core";
import {
  listOrganizationsPage,
  countOrganizations,
  getOwnersAndMemberCounts,
  organizationSlugExists,
  organizationExists,
  setOrganizationSuspension,
  getOrganizationDetail,
  getOrganizationMembers,
} from "./platform-organizations.db";
import type { CreatePlatformOrganizationBody } from "./platform-organizations.schema";

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerEmailVerified: boolean | null;
  ownerBanned: boolean | null;
  memberCount: number;
  plan: string | null;
  subscriptionStatus: string | null;
  seatQuantity: number | null;
  orgNumber: string | null;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  phone: string | null;
  taxId: string | null;
  suspended: boolean | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
}

export interface ListPlatformOrganizationsResult {
  organizations: PlatformOrganizationSummary[];
  total: number;
}

// withSystemScope, not a bare `db` client — organization_billing/organization_profile
// are RLS-enabled and fail closed (zero rows) for any query that doesn't set either an
// org-scoped session var or the bypass flag. The trust boundary here is
// requirePlatformPermission (checked before this ever runs), the same "trusted through
// a different mechanism than a per-org session" reasoning withSystemScope's own doc
// comment describes for webhook processing.
export async function listPlatformOrganizations(params: {
  page: number;
  limit: number;
  search?: string;
}): Promise<ListPlatformOrganizationsResult> {
  const offset = (params.page - 1) * params.limit;

  return withSystemScope(async (tx) => {
    const [rows, total] = await Promise.all([
      listOrganizationsPage(tx, params.limit, offset, params.search),
      countOrganizations(tx, params.search),
    ]);

    const ownersAndCounts = await getOwnersAndMemberCounts(
      tx,
      rows.map((row) => row.id),
    );
    const byId = new Map(ownersAndCounts.map((entry) => [entry.organizationId, entry]));

    const organizations: PlatformOrganizationSummary[] = rows.map((row) => {
      const owner = byId.get(row.id);
      return {
        ...row,
        ownerName: owner?.ownerName ?? null,
        ownerEmail: owner?.ownerEmail ?? null,
        ownerEmailVerified: owner?.ownerEmailVerified ?? null,
        ownerBanned: owner?.ownerBanned ?? null,
        memberCount: owner?.memberCount ?? 0,
      };
    });

    return { organizations, total };
  });
}

export interface CreatePlatformOrganizationResult {
  organizationId: string;
  ownerUserId: string;
}

// Translates a Better Auth APIError (email/slug taken, invalid input) into this app's
// own error envelope. isAPIError (not `instanceof APIError`) — this monorepo has
// flagged duplicate-pnpm-instance issues before (see AGENTS.md's note on why
// drizzle-orm operators are re-exported through @repo/db rather than imported
// directly); isAPIError is Better Auth's own cross-instance-safe check for exactly this.
// Always maps to VALIDATION_ERROR (422): both auth.api calls below run with no
// session/headers (the trusted server-action path, see AGENTS.md's Platform admin
// section), so Better Auth's own permission checks — which only run `if (session)` —
// never fire here; every APIError this can actually throw is an input problem
// (duplicate email, invalid email shape), never an auth failure.
function toValidationError(error: unknown, fallbackMessage: string): AppError {
  if (isAPIError(error)) {
    return new AppError("VALIDATION_ERROR", error.body?.message ?? fallbackMessage);
  }
  return new AppError("VALIDATION_ERROR", error instanceof Error ? error.message : fallbackMessage);
}

// Provisions a brand-new owner account + organization on behalf of a customer who
// doesn't have one yet (e.g. a company that signed up out of band) — not an
// attach-existing-user flow. Both auth.api calls are direct, headerless server actions,
// the same trusted path AGENTS.md documents for auth.api.createUser: with no
// session/headers, Better Auth skips its own requesting-user permission check entirely
// (verified against the installed admin/organization plugins' routes.mjs). The caller
// here is already gated by requirePlatformPermission({ organization: ["create"] })
// before this ever runs — this function is not a second authorization boundary.
export async function createPlatformOrganization(
  input: CreatePlatformOrganizationBody,
): Promise<CreatePlatformOrganizationResult> {
  // Checked first, before creating any account — the most common failure (slug taken)
  // would otherwise leave a real owner account dangling with no organization to show
  // for it. Not a full guarantee against a race (two admins submitting the same slug at
  // once), but auth.api.createOrganization's own check below still catches that case,
  // just after the user already exists — an accepted, documented trade-off, not a gap
  // that's slipping through unnoticed.
  if (await organizationSlugExists(db, input.organizationSlug)) {
    throw new AppError("VALIDATION_ERROR", "That organization slug is already taken");
  }

  let ownerUserId: string;
  try {
    const created = await auth.api.createUser({
      body: { email: input.ownerEmail, password: input.ownerPassword, name: input.ownerName },
    });
    ownerUserId = created.user.id;
  } catch (error) {
    throw toValidationError(error, "Failed to create the owner account");
  }

  try {
    const organization = await auth.api.createOrganization({
      body: { name: input.organizationName, slug: input.organizationSlug, userId: ownerUserId },
    });
    if (!organization) {
      throw new AppError("INTERNAL_ERROR", "Organization creation returned no result");
    }
    return { organizationId: organization.id, ownerUserId };
  } catch (error) {
    // The owner account created above is deliberately left in place even if this step
    // fails — not rolled back. Same "best-effort across two independent subsystems"
    // posture this repo already takes elsewhere (e.g. account.service.ts's Stripe
    // cancellation during account deletion) rather than a compensating delete that
    // could itself fail and leave things worse. The slug pre-check above already
    // eliminates the single most likely cause.
    if (error instanceof AppError) throw error;
    throw toValidationError(error, "Failed to create the organization");
  }
}

// Flag-only, per specs/platform-organizations.md — records the ban/reason on
// organization_profile, doesn't block anything yet. withSystemScope: same reasoning as
// listPlatformOrganizations, this is a platform-admin action on an arbitrary org, not
// something scoped to the caller's own active org.
export async function banPlatformOrganization(
  organizationId: string,
  reason: string | undefined,
): Promise<void> {
  await withSystemScope(async (tx) => {
    if (!(await organizationExists(tx, organizationId))) {
      throw new AppError("NOT_FOUND", "Organization not found");
    }
    await setOrganizationSuspension(tx, organizationId, true, reason ?? null);
  });
}

export async function unbanPlatformOrganization(organizationId: string): Promise<void> {
  await withSystemScope(async (tx) => {
    if (!(await organizationExists(tx, organizationId))) {
      throw new AppError("NOT_FOUND", "Organization not found");
    }
    await setOrganizationSuspension(tx, organizationId, false, null);
  });
}

export interface PlatformOrganizationMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  emailVerified: boolean;
  banned: boolean | null;
  role: string;
  joinedAt: Date;
}

export interface PlatformOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  suspended: boolean | null;
  suspendedAt: Date | null;
  suspensionReason: string | null;
  plan: string | null;
  subscriptionStatus: string | null;
  seatQuantity: number | null;
  providerCustomerId: string | null;
  providerSubscriptionId: string | null;
  orgNumber: string | null;
  industry: string | null;
  companySize: string | null;
  website: string | null;
  phone: string | null;
  taxId: string | null;
  description: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  members: PlatformOrganizationMember[];
}

// Same withSystemScope reasoning as listPlatformOrganizations — a platform-admin read
// across an arbitrary org, not scoped to the caller's own active org.
export async function getPlatformOrganizationDetail(
  organizationId: string,
): Promise<PlatformOrganizationDetail> {
  return withSystemScope(async (tx) => {
    const detail = await getOrganizationDetail(tx, organizationId);
    if (!detail) {
      throw new AppError("NOT_FOUND", "Organization not found");
    }
    const members = await getOrganizationMembers(tx, organizationId);
    return { ...detail, members };
  });
}
