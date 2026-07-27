import type { PlatformIndividualDetail } from "../../../api/types";
import { DetailField } from "@/components/detail-field";

interface IndividualBillingTabProps {
  individual: PlatformIndividualDetail;
}

export function IndividualBillingTab({ individual }: IndividualBillingTabProps) {
  return (
    <div className="rounded-lg border p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DetailField label="Plan" value={individual.plan} capitalize />
        <DetailField label="Subscription Status" value={individual.subscriptionStatus} capitalize />
        <DetailField label="Stripe Customer" value={individual.providerCustomerId} mono />
        <DetailField label="Stripe Subscription" value={individual.providerSubscriptionId} mono />
      </dl>
    </div>
  );
}
