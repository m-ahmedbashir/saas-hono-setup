"use client";

import { useState } from "react";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertModal } from "@/components/modal/alert-modal";
import { BackButton } from "@/components/back-button";
import { platformIndividualDetailQueryOptions } from "../../api/queries";
import { banIndividualMutation, unbanIndividualMutation } from "../../api/mutations";
import { IndividualProfileTab } from "./tabs/individual-profile-tab";
import { IndividualBillingTab } from "./tabs/individual-billing-tab";
import { IndividualOrganizationsTab } from "./tabs/individual-organizations-tab";

interface IndividualDetailViewProps {
  userId: string;
}

const TABS = ["profile", "billing", "organizations"] as const;

// URL-backed, not useState — same reasoning as organization-detail-view.tsx: a page
// reload or shared link lands back on whichever tab was open.
const tabParser = parseAsStringLiteral(TABS).withDefault("profile").withOptions({
  shallow: true,
  history: "replace",
});

export function IndividualDetailView({ userId }: IndividualDetailViewProps) {
  const { data: individual } = useSuspenseQuery(platformIndividualDetailQueryOptions(userId));
  const [tab, setTab] = useQueryState("tab", tabParser);
  const [banOpen, setBanOpen] = useState(false);

  const ban = useMutation({
    ...banIndividualMutation,
    onSuccess: () => {
      toast.success(`${individual.name} has been banned`);
      setBanOpen(false);
    },
    onError: () => toast.error("Failed to ban individual"),
  });

  const unban = useMutation({
    ...unbanIndividualMutation,
    onSuccess: () => toast.success(`${individual.name} has been unbanned`),
    onError: () => toast.error("Failed to unban individual"),
  });

  return (
    <div className="flex flex-col gap-4">
      <AlertModal
        isOpen={banOpen}
        onClose={() => setBanOpen(false)}
        onConfirm={() => ban.mutate({ userId: individual.id })}
        loading={ban.isPending}
      />

      <BackButton fallbackHref="/dashboard/individuals" />

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold">{individual.name}</h2>
            {individual.emailVerified ? (
              <Badge variant="outline" className="border-green-600 text-green-700">
                Verified
              </Badge>
            ) : (
              <Badge variant="secondary">Unverified</Badge>
            )}
            {individual.banned && <Badge variant="destructive">Banned</Badge>}
          </div>
          <span className="text-muted-foreground text-sm">
            {individual.email} · Joined {new Date(individual.createdAt).toLocaleDateString()}
          </span>
          {individual.banned && individual.banReason && (
            <span className="text-destructive text-sm">Reason: {individual.banReason}</span>
          )}
        </div>
        <div className="shrink-0">
          {individual.banned ? (
            <Button
              variant="outline"
              onClick={() => unban.mutate(individual.id)}
              isLoading={unban.isPending}
            >
              <Icons.circleCheck className="mr-2 h-4 w-4" /> Unban
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setBanOpen(true)}>
              <Icons.circleX className="mr-2 h-4 w-4" /> Ban
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(value) => setTab(value as (typeof TABS)[number])}>
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="organizations">
            Organizations ({individual.organizations.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <IndividualProfileTab individual={individual} />
        </TabsContent>
        <TabsContent value="billing">
          <IndividualBillingTab individual={individual} />
        </TabsContent>
        <TabsContent value="organizations">
          <IndividualOrganizationsTab organizations={individual.organizations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
