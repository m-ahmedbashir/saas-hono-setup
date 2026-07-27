import PageContainer from "@/components/layout/page-container";
import UserListingPage from "@/features/users/components/user-listing";
import { searchParamsCache } from "@/lib/searchparams";
import type { SearchParams } from "nuqs/server";
import { usersInfoContent } from "@/features/users/info-content";
import { UserFormSheetTrigger } from "@/features/users/components/user-form-sheet";
import { PlatformAccessGate } from "@/components/platform-access-gate";

export const metadata = {
  title: "Dashboard: Users",
};

type PageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function UsersPage(props: PageProps) {
  const searchParams = await props.searchParams;
  searchParamsCache.parse(searchParams);

  return (
    <PageContainer
      pageTitle="Platform Users"
      pageDescription="Manage your team's platform access — admin and support roles."
      infoContent={usersInfoContent}
      pageHeaderAction={<UserFormSheetTrigger />}
    >
      <PlatformAccessGate>
        <UserListingPage />
      </PlatformAccessGate>
    </PageContainer>
  );
}
