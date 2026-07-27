import PageContainer from "@/components/layout/page-container";
import OrganizationListingPage from "@/features/organizations/components/organization-listing";
import { searchParamsCache } from "@/lib/searchparams";
import type { SearchParams } from "nuqs/server";
import { organizationsInfoContent } from "@/features/organizations/info-content";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { OrganizationFormSheetTrigger } from "@/features/organizations/components/organization-form-sheet";

export const metadata = {
  title: "Dashboard: Organizations",
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function OrganizationsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle="Platform Organizations"
      pageDescription="Every organization on the platform — owner, member count, plan, and billing status."
      infoContent={organizationsInfoContent}
      pageHeaderAction={<OrganizationFormSheetTrigger />}
    >
      <PlatformAccessGate>
        <OrganizationListingPage />
      </PlatformAccessGate>
    </PageContainer>
  );
}
