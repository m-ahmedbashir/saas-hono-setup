import { cookies } from "next/headers";
import { getRecentSignups } from "@/features/overview/api/stats";
import { RecentSignups } from "@/features/overview/components/recent-signups";

export default async function Sales() {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  // Same reasoning as layout.tsx — a non-staff session gets a 403 from the underlying
  // staff-only endpoints; treated as "nothing to show" rather than crashing this slot.
  const signups = cookieHeader
    ? await getRecentSignups({ Cookie: cookieHeader }).catch(() => [])
    : [];

  return <RecentSignups signups={signups} />;
}
