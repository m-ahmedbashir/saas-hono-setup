// Backed by apps/api's own /platform-individuals route (apps/api/src/modules/
// platform-individuals) — the complement of the platform Users (staff) page: every
// account that ISN'T admin/support. See specs/platform-individuals.md.
export interface PlatformIndividualOrganization {
  id: string;
  name: string;
  role: string;
}

export interface PlatformIndividual {
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

export type PlatformIndividualFilters = {
  page?: number;
  limit?: number;
  search?: string;
  // Comma-separated when multiple facet values are picked (matches
  // apps/api's platform-individuals.schema.ts, which splits on "," before validating
  // each member against IndividualPlanId/SubscriptionStatus).
  plan?: string;
  subscriptionStatus?: string;
  hasOrganization?: boolean;
};

export type PlatformIndividualsResponse = {
  individuals: PlatformIndividual[];
  total: number;
};

// Backed by the new `invoices` table (specs/billing-integrity-plan.md) — a curated,
// one-row-per-real-transaction receipt record, distinct from the raw `billing_events`
// audit ledger. `receiptUrl` is Stripe's own hosted invoice page, not a PDF this app
// generates.
export interface PlatformIndividualInvoice {
  id: string;
  planId: string;
  amountTotal: number;
  currency: string;
  status: string;
  receiptUrl: string | null;
  issuedAt: Date;
}

// Everything listIndividualsPage's summary row deliberately leaves out (address,
// raw Stripe ids) — a detail page can afford the heavier shape a table row showing
// every account on the platform cannot.
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
