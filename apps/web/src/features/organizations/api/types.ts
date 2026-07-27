// Backed by apps/api's own /platform-organizations route (apps/api/src/modules/
// platform-organizations), not Better Auth's organization plugin — that plugin's
// /organization/list is scoped to the caller's own memberships, this is a
// platform-admin-only view of every organization on the platform. See
// specs/platform-organizations.md.
export interface PlatformOrganization {
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

export type PlatformOrganizationFilters = {
  page?: number;
  limit?: number;
  search?: string;
};

export type PlatformOrganizationsResponse = {
  organizations: PlatformOrganization[];
  total: number;
};

export type CreatePlatformOrganizationPayload = {
  organizationName: string;
  organizationSlug: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
};

export type CreatePlatformOrganizationResult = {
  organizationId: string;
  ownerUserId: string;
};

export type BanOrganizationPayload = {
  organizationId: string;
  reason?: string;
};

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

// Everything listOrganizationsPage's summary row deliberately leaves out (address,
// description, raw Stripe ids, the full member list) — a detail page can afford the
// heavier shape a table row showing every org on the platform cannot.
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
