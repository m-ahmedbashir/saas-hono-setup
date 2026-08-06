import type { PlatformOrganizationDetail } from "../../../api/types";
import { DetailField } from "@/components/detail-field";
import { BillingHistoryTable } from "@/components/billing-history-table";

interface OrganizationBillingTabProps {
  organization: PlatformOrganizationDetail;
}

export function OrganizationBillingTab({ organization }: OrganizationBillingTabProps) {
  return (
    <div className="divide-border divide-y rounded-lg border">
      <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <DetailField label="Plan" value={organization.plan} capitalize />
        <DetailField
          label="Subscription Status"
          value={organization.subscriptionStatus}
          capitalize
        />
        <DetailField label="Seats" value={organization.seatQuantity?.toString() ?? null} />
        <DetailField label="Stripe Customer" value={organization.providerCustomerId} mono />
        <DetailField label="Stripe Subscription" value={organization.providerSubscriptionId} mono />
      </dl>
      <div className="p-4">
        <h3 className="mb-3 text-sm font-medium">Billing History</h3>
        <BillingHistoryTable invoices={organization.invoices} />
      </div>
    </div>
  );
}
