import type { PlatformIndividualDetail } from "../../../api/types";
import { DetailField } from "@/components/detail-field";
import { BillingHistoryTable } from "@/components/billing-history-table";

interface IndividualBillingTabProps {
  individual: PlatformIndividualDetail;
}

export function IndividualBillingTab({ individual }: IndividualBillingTabProps) {
  return (
    <div className="divide-border divide-y rounded-lg border">
      <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <DetailField label="Plan" value={individual.plan} capitalize />
        <DetailField label="Subscription Status" value={individual.subscriptionStatus} capitalize />
        <DetailField label="Stripe Customer" value={individual.providerCustomerId} mono />
        <DetailField label="Stripe Subscription" value={individual.providerSubscriptionId} mono />
      </dl>
      <div className="p-4">
        <h3 className="mb-3 text-sm font-medium">Billing History</h3>
        <BillingHistoryTable invoices={individual.invoices} />
      </div>
    </div>
  );
}
