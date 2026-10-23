"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import PageContainer from "@/components/layout/page-container";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailField } from "@/components/detail-field";
import { Icons } from "@/components/icons";
import { cn } from "@repo/shared/utils";
import { authClient, useSession } from "@/lib/auth-client";
import { organizationProfileQueryOptions } from "../api/queries";
import { roleCan } from "@/lib/permissions";
import { OrganizationNameForm } from "./organization-name-form";
import { OrganizationProfileDetails, OrganizationProfileForm } from "./organization-profile-form";

const readOnlyNotice = "Only owners and admins can change organization settings.";

/**
 * Settings for the session's active organization. What's editable follows the caller's
 * permissions from the shared `roles` map — organization:update for the name,
 * organizationProfile:manage for the profile — never their role's name.
 */
export function OrganizationSettingsView() {
  const { data: session, isPending: sessionPending } = useSession();
  const { data: organization, isPending: organizationPending } = authClient.useActiveOrganization();

  let content: React.ReactNode;
  if (sessionPending || (session && organizationPending)) {
    content = <SettingsSkeleton />;
  } else if (session && organization) {
    const myRole = organization.members.find((m) => m.userId === session.user.id)?.role;
    content = (
      <SettingsPanel
        // Remount per org, so one organization's form values never carry into another's.
        key={organization.id}
        organizationId={organization.id}
        name={organization.name}
        canRename={roleCan(myRole, { organization: ["update"] })}
        canEditProfile={roleCan(myRole, { organizationProfile: ["manage"] })}
      />
    );
  } else {
    content = <NoOrganization />;
  }

  return (
    <PageContainer
      pageTitle="Organization settings"
      pageDescription={
        organization ? `Settings for ${organization.name}.` : "Manage your organization."
      }
    >
      {content}
    </PageContainer>
  );
}

function SettingsPanel({
  organizationId,
  name,
  canRename,
  canEditProfile,
}: {
  organizationId: string;
  name: string;
  canRename: boolean;
  canEditProfile: boolean;
}) {
  const profile = useQuery(organizationProfileQueryOptions(organizationId));

  return (
    <div className="flex w-full flex-col gap-6">
      {!(canRename && canEditProfile) && (
        <p className="text-muted-foreground text-sm">{readOnlyNotice}</p>
      )}
      <Section title="Name" description="How your organization appears to its members.">
        {canRename ? (
          <OrganizationNameForm organizationId={organizationId} currentName={name} />
        ) : (
          <dl>
            <DetailField label="Organization name" value={name} />
          </dl>
        )}
      </Section>
      <Section title="Profile" description="Company details for your records and invoices.">
        {profile.isPending ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : profile.isError ? (
          <Alert variant="destructive">
            <Icons.alertCircle className="size-4" />
            <AlertDescription>{profile.error.message}</AlertDescription>
          </Alert>
        ) : canEditProfile ? (
          <OrganizationProfileForm organizationId={organizationId} profile={profile.data} />
        ) : (
          <OrganizationProfileDetails profile={profile.data} />
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card grid gap-6 rounded-xl border p-6 md:grid-cols-3">
      <div className="min-w-0 md:col-span-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <div className="min-w-0 md:col-span-2">{children}</div>
    </section>
  );
}

function NoOrganization() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <Icons.teams className="text-muted-foreground size-10" />
      <h3 className="mt-4 text-sm font-medium">No organization selected</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm">
        Choose one of your organizations, or create one, to see its settings.
      </p>
      <Link
        href="/team"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "focus-visible:ring-ring mt-4 focus-visible:ring-2 focus-visible:ring-offset-2",
        )}
      >
        Go to team
      </Link>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="bg-card space-y-3 rounded-xl border p-6" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
