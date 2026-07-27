import type { PlatformOrganizationDetail } from "../../../api/types";
import { DetailField } from "../detail-field";

interface OrganizationBillingTabProps {
  organization: PlatformOrganizationDetail;
}

export function OrganizationBillingTab({ organization }: OrganizationBillingTabProps) {
  return (
    <div className="rounded-lg border p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
    </div>
  );
}
