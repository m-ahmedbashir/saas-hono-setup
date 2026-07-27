import PageContainer from "@/components/layout/page-container";
import IndividualListingPage from "@/features/individuals/components/individual-listing";
import { searchParamsCache } from "@/lib/searchparams";
import type { SearchParams } from "nuqs/server";
import { individualsInfoContent } from "@/features/individuals/info-content";
import { PlatformAccessGate } from "@/components/platform-access-gate";

export const metadata = {
  title: "Dashboard: Individuals",
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function IndividualsPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle="Platform Individuals"
      pageDescription="Every non-staff account on the platform — profile, subscription, and organization membership."
      infoContent={individualsInfoContent}
    >
      <PlatformAccessGate>
        <IndividualListingPage />
      </PlatformAccessGate>
    </PageContainer>
  );
}
