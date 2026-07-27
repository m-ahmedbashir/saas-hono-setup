import type { PlatformOrganizationDetail } from "../../../api/types";
import { DetailField } from "@/components/detail-field";

interface OrganizationDetailsTabProps {
  organization: PlatformOrganizationDetail;
}

export function OrganizationDetailsTab({ organization }: OrganizationDetailsTabProps) {
  const address = [
    organization.addressStreet,
    organization.addressCity,
    organization.addressState,
    organization.addressPostalCode,
    organization.addressCountry,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="rounded-lg border p-4">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DetailField label="Industry" value={organization.industry} />
        <DetailField label="Company Size" value={organization.companySize} />
        <DetailField label="Website" value={organization.website} link />
        <DetailField label="Phone" value={organization.phone} />
        <DetailField label="Tax ID" value={organization.taxId} />
        <DetailField label="Address" value={address || null} />
      </dl>
      {organization.description && (
        <p className="text-muted-foreground mt-4 text-sm">{organization.description}</p>
      )}
    </div>
  );
}
