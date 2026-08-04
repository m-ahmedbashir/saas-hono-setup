"use client";

import { useState } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { platformOrganizationDetailQueryOptions } from "../../api/queries";
import { unbanOrganizationMutation } from "../../api/mutations";
import { BanOrganizationModal } from "../ban-organization-modal";
import { BackButton } from "@/components/back-button";
import { OrganizationDetailsTab } from "./tabs/organization-details-tab";
import { OrganizationBillingTab } from "./tabs/organization-billing-tab";
import { OrganizationMembersTab } from "./tabs/organization-members-tab";

interface OrganizationDetailViewProps {
  organizationId: string;
}

const TABS = ["details", "billing", "members"] as const;

// URL-backed, not useState — a page reload (or a shared/bookmarked link) lands back
// on whichever tab was open, not always tab one. shallow: true keeps switching tabs
// from re-running the server prefetch/RSC render.
const tabParser = parseAsStringLiteral(TABS).withDefault("details").withOptions({
  shallow: true,
  history: "replace",
});

export function OrganizationDetailView({ organizationId }: OrganizationDetailViewProps) {
  const { data: org } = useSuspenseQuery(platformOrganizationDetailQueryOptions(organizationId));
  const [tab, setTab] = useQueryState("tab", tabParser);
  const [banOpen, setBanOpen] = useState(false);

  const unban = useMutation({
    ...unbanOrganizationMutation,
    onSuccess: () => toast.success(`${org.name} has been unsuspended`),
    onError: () => toast.error("Failed to unsuspend organization"),
  });

  return (
    <div className="flex flex-col gap-4">
      <BanOrganizationModal
        isOpen={banOpen}
        onClose={() => setBanOpen(false)}
        organizationId={org.id}
        organizationName={org.name}
      />

      <BackButton fallbackHref="/dashboard/organizations" />

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{org.name}</h2>
            {org.suspended ? (
              <Badge variant="destructive">Suspended</Badge>
            ) : (
              <Badge variant="default">Active</Badge>
            )}
          </div>
          <span className="text-muted-foreground text-sm">
            {org.slug} · Org #{org.orgNumber ?? "—"} · Created{" "}
            {new Date(org.createdAt).toLocaleDateString()}
          </span>
          {org.suspended && org.suspensionReason && (
            <span className="text-destructive text-sm">Reason: {org.suspensionReason}</span>
          )}
        </div>
        <div className="shrink-0">
          {org.suspended ? (
            <Button
              variant="outline"
              onClick={() => unban.mutate(org.id)}
              isLoading={unban.isPending}
            >
              <Icons.circleCheck className="mr-2 h-4 w-4" /> Unsuspend
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setBanOpen(true)}>
              <Icons.circleX className="mr-2 h-4 w-4" /> Suspend Organization
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="members">Members ({org.members.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="details">
          <OrganizationDetailsTab organization={org} />
        </TabsContent>
        <TabsContent value="billing">
          <OrganizationBillingTab organization={org} />
        </TabsContent>
        <TabsContent value="members">
          <OrganizationMembersTab members={org.members} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
