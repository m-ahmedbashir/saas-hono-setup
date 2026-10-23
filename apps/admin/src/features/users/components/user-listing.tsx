import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { cookies } from "next/headers";
import { getQueryClient } from "@repo/shared/query-client";
import { searchParamsCache } from "@/lib/searchparams";
import { usersQueryOptions } from "../api/queries";
import { UsersTable } from "./users-table";

export default async function UserListingPage() {
  const page = searchParamsCache.get("page");
  const search = searchParamsCache.get("name");
  const pageLimit = searchParamsCache.get("perPage");
  const role = searchParamsCache.get("role");

  // Sort isn't included in this server-side prefetch (unlike page/search/role) — parsing
  // the URL's sort-state array server-side would duplicate getSortingStateParser's logic
  // for no real benefit. The client's useSuspenseQuery in users-table/index.tsx builds
  // the real filters (including sort) and refetches once mounted if the initial URL had
  // a sort applied; the only cost is one extra request in that specific case, not
  // incorrect data.
  const filters = {
    page,
    limit: pageLimit,
    ...(search && { search }),
    ...(role && { role }),
  };

  const queryClient = getQueryClient();

  // `authClient` runs on the server here, so the incoming request's session cookie has
  // to be forwarded explicitly — it won't be picked up automatically the way it is in
  // the browser. Without this the prefetch is unauthenticated and the admin plugin
  // rejects it. If there's no session cookie yet, skip the prefetch; the client will
  // either fetch once the gate confirms access or the gate will redirect.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (cookieHeader) {
    void queryClient.prefetchQuery(usersQueryOptions(filters, { Cookie: cookieHeader }));
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <UsersTable />
    </HydrationBoundary>
  );
}
