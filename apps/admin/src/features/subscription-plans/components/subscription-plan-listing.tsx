import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { getQueryClient } from "@repo/shared/query-client";
import { subscriptionPlansQueryOptions } from "../api/queries";
import { SubscriptionPlanTable } from "./subscription-plan-table";

export default async function SubscriptionPlanListingPage() {
  const queryClient = getQueryClient();

  // Same reasoning as every other listing.tsx in this app — apps/api needs the
  // session cookie forwarded explicitly for a server-side fetch; skip the prefetch
  // without one rather than issuing an unauthenticated request the gate would reject.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    void queryClient.prefetchQuery(subscriptionPlansQueryOptions({}, { Cookie: cookieHeader }));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SubscriptionPlanTable />
    </HydrationBoundary>
  );
}
