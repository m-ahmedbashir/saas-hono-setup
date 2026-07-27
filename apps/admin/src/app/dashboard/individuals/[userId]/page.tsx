import { Suspense } from "react";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import PageContainer from "@/components/layout/page-container";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { getQueryClient } from "@/lib/query-client";
import { platformIndividualDetailQueryOptions } from "@/features/individuals/api/queries";
import { IndividualDetailView } from "@/features/individuals/components/individual-detail/individual-detail-view";
import { IndividualDetailSkeleton } from "@/features/individuals/components/individual-detail/individual-detail-skeleton";

export const metadata = {
  title: "Dashboard: Individual Details",
};

type PageProps = {
  params: Promise<{ userId: string }>;
};

export default async function IndividualDetailPage(props: PageProps) {
  const { userId } = await props.params;

  const queryClient = getQueryClient();

  // Same reasoning as organizations' detail page.tsx — apps/api needs the session
  // cookie forwarded explicitly for a server-side fetch.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    void queryClient.prefetchQuery(
      platformIndividualDetailQueryOptions(userId, { Cookie: cookieHeader }),
    );
  }

  return (
    <PageContainer pageTitle="Individual Details">
      <PlatformAccessGate>
        <HydrationBoundary state={dehydrate(queryClient)}>
          <Suspense fallback={<IndividualDetailSkeleton />}>
            <IndividualDetailView userId={userId} />
          </Suspense>
        </HydrationBoundary>
      </PlatformAccessGate>
    </PageContainer>
  );
}
