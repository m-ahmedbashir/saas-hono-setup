import type { Metadata } from "next";
import { AcceptInviteView } from "@/features/team/components/accept-invite-view";

export const metadata: Metadata = {
  title: "Accept invitation",
};

// Reachable signed in or out — proxy.ts deliberately lets /auth/accept-invite through for
// signed-in users too (accepting an invite to a second organization).
export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string | string[] }>;
}) {
  const { id } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <AcceptInviteView invitationId={typeof id === "string" ? id : undefined} />
    </main>
  );
}
