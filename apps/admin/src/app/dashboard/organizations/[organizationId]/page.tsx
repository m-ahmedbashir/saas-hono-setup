import { Suspense } from "react";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import PageContainer from "@/components/layout/page-container";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { getQueryClient } from "@repo/shared/query-client";
import { platformOrganizationDetailQueryOptions } from "@/features/organizations/api/queries";
import { OrganizationDetailView } from "@/features/organizations/components/organization-detail/organization-detail-view";
import { OrganizationDetailSkeleton } from "@/features/organizations/components/organization-detail/organization-detail-skeleton";

export const metadata = {
  title: "Dashboard: Organization Details",
};

type PageProps = {
  params: Promise<{ organizationId: string }>;
};

export default async function OrganizationDetailPage(props: PageProps) {
  const { organizationId } = await props.params;

  const queryClient = getQueryClient();

  // Same reasoning as organization-listing.tsx — apps/api needs the session cookie
  // forwarded explicitly for a server-side fetch.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    void queryClient.prefetchQuery(
      platformOrganizationDetailQueryOptions(organizationId, { Cookie: cookieHeader }),
    );
  }

  return (
    <PageContainer pageTitle="Organization Details">
      <PlatformAccessGate>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <Suspense fallback={<OrganizationDetailSkeleton />}>
            <OrganizationDetailView organizationId={organizationId} />
          </Suspense>
        </HydrationBoundary>
      </PlatformAccessGate>
    </PageContainer>
  );
}
