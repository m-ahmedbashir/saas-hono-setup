import type { PlatformIndividualDetail } from "../../../api/types";
import { DetailField } from "@/components/detail-field";

interface IndividualProfileTabProps {
  individual: PlatformIndividualDetail;
}

export function IndividualProfileTab({ individual }: IndividualProfileTabProps) {
  const address = [
    individual.addressStreet,
    individual.addressCity,
    individual.addressState,
    individual.addressPostalCode,
    individual.addressCountry,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-lg border p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DetailField label="Phone" value={individual.phone} />
        <DetailField
          label="Date of Birth"
          value={
            individual.dateOfBirth ? new Date(individual.dateOfBirth).toLocaleDateString() : null
          }
        />
        <DetailField label="Address" value={address || null} />
      </dl>
    </div>
  );
}
