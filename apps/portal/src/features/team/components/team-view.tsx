"use client";

import Link from "next/link";
import PageContainer from "@/components/layout/page-container";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@repo/shared/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { authClient, useSession } from "@/lib/auth-client";
import { useSwitchOrganization } from "@/hooks/use-switch-organization";
import { canManageTeam } from "../api/service";
import type { ActiveOrganization } from "../types";
import { InvitationList, pendingInvitations } from "./invitation-list";
import { InviteMemberDialog } from "./invite-member-dialog";
import { MemberList } from "./member-list";

const focusRing = "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2";

// Team management is an organization concept only — an individual account has no team.
// Members and invitations come straight from Better Auth's reactive active-organization
// hook, which refetches itself after every invite/remove/role change, so this page never
// has to invalidate anything by hand.
export function TeamView() {
  const { data: session, isPending: sessionPending } = useSession();
  const { data: organization, isPending: organizationPending } = authClient.useActiveOrganization();

  let content: React.ReactNode;
  if (sessionPending || (session && organizationPending)) {
    content = <TeamSkeleton />;
  } else if (!session) {
    // proxy.ts only checks that a session cookie exists, so an expired or revoked one gets
    // this far — say so rather than loading forever.
    content = <SessionEnded />;
  } else if (organization) {
    content = <TeamPanel organization={organization} currentUserId={session.user.id} />;
  } else {
    content = <ChooseOrganization />;
  }

  return (
    <PageContainer
      pageTitle="Team"
      pageDescription={
        organization
          ? `People in ${organization.name}.`
          : "Invite and manage your organization's members."
      }
    >
      {content}
    </PageContainer>
  );
}

function TeamPanel({
  organization,
  currentUserId,
}: {
  organization: ActiveOrganization;
  currentUserId: string;
}) {
  const myRole = organization.members.find((m) => m.userId === currentUserId)?.role;
  const manage = canManageTeam(myRole);

  return (
    <div className="flex w-full flex-col gap-6">
      {manage ? (
        <div className="flex justify-end">
          <InviteMemberDialog />
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          Only organization owners and admins can invite or remove people.
        </p>
      )}
      <MemberList members={organization.members} currentUserId={currentUserId} canManage={manage} />
      {manage && <InvitationList invitations={pendingInvitations(organization.invitations)} />}
    </div>
  );
}

/**
 * No active organization on this session. Better Auth doesn't pick one at sign-in, so an
 * org member on a fresh session lands here too — offer the organizations they belong to
 * instead of wrongly telling them they only have a personal account.
 */
function ChooseOrganization() {
  const { data: organizations, isPending } = authClient.useListOrganizations();
  // Same hook as the nav's switcher, so every org switch also clears cached data.
  const open = useSwitchOrganization();

  if (isPending) return <TeamSkeleton />;
  if (!organizations || organizations.length === 0) return <NoOrganization />;

  return (
    <section aria-labelledby="choose-org-heading" className="bg-card rounded-xl border">
      <div className="border-b px-6 py-4">
        <h2 id="choose-org-heading" className="text-sm font-medium">
          Choose an organization
        </h2>
      </div>
      {open.error && (
        <Alert variant="destructive" className="m-4 w-auto">
          <Icons.alertCircle className="size-4" />
          <AlertDescription>{open.error.message}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-border divide-y">
        {organizations.map((org) => (
          <li key={org.id} className="flex min-w-0 items-center justify-between gap-4 px-6 py-4">
            <p className="min-w-0 truncate text-sm font-medium">{org.name}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={open.isPending}
              onClick={() => open.mutate(org.id)}
              className={cn(focusRing, "shrink-0 disabled:cursor-not-allowed disabled:opacity-50")}
            >
              {open.isPending && open.variables === org.id ? "Opening…" : "Open"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoOrganization() {
  return (
    <EmptyState
      title="Teams are for organizations"
      body="You're using a personal account. Join an organization through an invitation link to see its team here."
      href="/billing"
      action="Go to billing"
    />
  );
}

function SessionEnded() {
  return (
    <EmptyState
      title="Your session has ended"
      body="Sign in again to see your team."
      href="/auth/sign-in?redirect=%2Fteam"
      action="Sign in"
    />
  );
}

function EmptyState({
  title,
  body,
  href,
  action,
}: {
  title: string;
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <Icons.teams className="text-muted-foreground size-10" />
      <h3 className="mt-4 text-sm font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">{body}</p>
      <Link href={href} className={cn(buttonVariants({ variant: "outline" }), "mt-4", focusRing)}>
        {action}
      </Link>
    </div>
  );
}

function TeamSkeleton() {
  return (
    <div className="bg-card divide-border divide-y rounded-xl border" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
