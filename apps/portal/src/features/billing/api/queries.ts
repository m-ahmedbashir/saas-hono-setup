import { queryOptions } from "@tanstack/react-query";
import {
  canManageOrganizationBilling,
  getIndividualBilling,
  getIndividualPlans,
  getOrganizationBilling,
  getOrganizationPlans,
} from "./service";

// Organization keys carry the organizationId even though the request itself doesn't
// (apps/api reads it from the session) — so a cached response for one org can never be
// served after switching to another, independent of the broad invalidation on org switch.
export const billingKeys = {
  all: ["billing"] as const,
  organization: (organizationId: string) =>
    [...billingKeys.all, "organization", organizationId] as const,
  organizationPlans: (organizationId: string) =>
    [...billingKeys.all, "organization-plans", organizationId] as const,
  organizationCanManage: (organizationId: string) =>
    [...billingKeys.all, "organization-can-manage", organizationId] as const,
  individual: () => [...billingKeys.all, "individual"] as const,
  individualPlans: () => [...billingKeys.all, "individual-plans"] as const,
};

export const organizationBillingQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: billingKeys.organization(organizationId),
    queryFn: getOrganizationBilling,
  });

export const organizationPlansQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: billingKeys.organizationPlans(organizationId),
    queryFn: getOrganizationPlans,
  });

export const organizationCanManageQueryOptions = (organizationId: string) =>
  queryOptions({
    queryKey: billingKeys.organizationCanManage(organizationId),
    queryFn: canManageOrganizationBilling,
  });

export const individualBillingQueryOptions = () =>
  queryOptions({ queryKey: billingKeys.individual(), queryFn: getIndividualBilling });

export const individualPlansQueryOptions = () =>
  queryOptions({ queryKey: billingKeys.individualPlans(), queryFn: getIndividualPlans });
