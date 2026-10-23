import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { getQueryClient } from "@repo/shared/query-client";
import { searchParamsCache } from "@/lib/searchparams";
import { platformIndividualsQueryOptions } from "../api/queries";
import { IndividualsTable } from "./individuals-table";

export default async function IndividualListingPage() {
  const page = searchParamsCache.get("page");
  const pageLimit = searchParamsCache.get("perPage");
  const search = searchParamsCache.get("name");
  const plan = searchParamsCache.get("plan");
  const subscriptionStatus = searchParamsCache.get("subscriptionStatus");
  const organizations = searchParamsCache.get("organizations");

  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(plan && { plan }),
    ...(subscriptionStatus && { subscriptionStatus }),
    ...(organizations && { hasOrganization: organizations === "has" }),
  };

  const queryClient = getQueryClient();

  // Same reasoning as features/organizations/components/organization-listing.tsx —
  // apps/api needs the session cookie forwarded explicitly for a server-side fetch;
  // skip the prefetch without one rather than issuing an unauthenticated request the
  // gate would reject.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    void queryClient.prefetchQuery(
      platformIndividualsQueryOptions(filters, { Cookie: cookieHeader }),
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <IndividualsTable />
    </HydrationBoundary>
  );
}
