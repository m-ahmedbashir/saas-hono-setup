import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { getQueryClient } from "@/lib/query-client";
import { searchParamsCache } from "@/lib/searchparams";
import { platformOrganizationsQueryOptions } from "../api/queries";
import { OrganizationsTable } from "./organizations-table";

export default async function OrganizationListingPage() {
  const page = searchParamsCache.get("page");
  const pageLimit = searchParamsCache.get("perPage");
  const search = searchParamsCache.get("name");

  const filters = { page, limit: pageLimit, ...(search && { search }) };

  const queryClient = getQueryClient();

  // Same reasoning as features/users/components/user-listing.tsx — apps/api needs the
  // session cookie forwarded explicitly for a server-side fetch; skip the prefetch
  // without one rather than issuing an unauthenticated request the gate would reject.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    void queryClient.prefetchQuery(
      platformOrganizationsQueryOptions(filters, { Cookie: cookieHeader }),
    );
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <OrganizationsTable />
    </HydrationBoundary>
  );
}
