import PageContainer from "@/components/layout/page-container";
import StaffListingPage from "@/features/staff/components/staff-listing";
import { searchParamsCache } from "@/lib/searchparams";
import type { SearchParams } from "nuqs/server";
import { staffInfoContent } from "@/features/staff/info-content";
import { StaffFormSheetTrigger } from "@/features/staff/components/staff-form-sheet";
import { PlatformAccessGate } from "@/components/platform-access-gate";

export const metadata = {
  title: "Dashboard: Staff",
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function StaffPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle="Platform Staff"
      pageDescription="Manage your team's platform access — admin and support roles."
      infoContent={staffInfoContent}
      pageHeaderAction={<StaffFormSheetTrigger />}
    >
      <PlatformAccessGate>
        <StaffListingPage />
      </PlatformAccessGate>
    </PageContainer>
  );
}
