"use client";

import PageContainer from "@/components/layout/page-container";
import { authClient } from "@/lib/auth-client";
import { BillingSkeleton } from "./billing-states";
import { CheckoutStatusNotice } from "./checkout-status-notice";
import { IndividualBilling } from "./individual-billing";
import { OrganizationBilling } from "./organization-billing";

// One page, two billing universes (specs/customer-portal-plan.md): with an active
// organization, this shows that org's seat-based billing; without one, the user's own
// individual billing. The active org comes from Better Auth's own reactive hook, so an
// org switch re-renders this with the right scope.
export function BillingView() {
  const { data: activeOrganization, isPending } = authClient.useActiveOrganization();

  return (
    <PageContainer
      pageTitle="Billing"
      pageDescription={
        activeOrganization
          ? `Plan and subscription for ${activeOrganization.name}.`
          : "Your plan and subscription."
      }
    >
      <div className="flex w-full flex-col gap-6">
        <CheckoutStatusNotice />
        {isPending ? (
          <BillingSkeleton />
        ) : activeOrganization ? (
          <OrganizationBilling
            organizationId={activeOrganization.id}
            memberCount={activeOrganization.members.length}
          />
        ) : (
          <IndividualBilling />
        )}
      </div>
    </PageContainer>
  );
}
