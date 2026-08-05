"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateSubscriptionPlanMutation } from "../../api/mutations";
import type { SubscriptionPlan } from "../../api/types";
import { Icons } from "@/components/icons";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { SubscriptionPlanFormSheet } from "../subscription-plan-form-sheet";

interface CellActionProps {
  data: SubscriptionPlan;
}

export function CellAction({ data }: CellActionProps) {
  const [editOpen, setEditOpen] = useState(false);

  const toggleActive = useMutation({
    ...updateSubscriptionPlanMutation,
    onSuccess: () =>
      toast.success(data.isActive ? `${data.name} deactivated` : `${data.name} activated`),
    // The server's VALIDATION_ERROR message (e.g. "assign a different default plan
    // first") is the useful part here — surface it directly rather than a generic
    // failure toast, same reasoning the edit sheet's inline banner follows.
    onError: (error) => toast.error(error.message || "Failed to update plan"),
  });

  return (
    <>
      <SubscriptionPlanFormSheet open={editOpen} onOpenChange={setEditOpen} plan={data} />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant="ghost" className="h-8 w-8 p-0" />}>
          <span className="sr-only">Open menu</span>
          <Icons.ellipsis className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Plan</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Icons.edit className="mr-2 h-4 w-4" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                toggleActive.mutate({
                  id: data.id,
                  payload: {
                    name: data.name,
                    description: data.description ?? undefined,
                    seatLimit: data.seatLimit ?? undefined,
                    providerPriceId: data.providerPriceId ?? undefined,
                    features: data.features,
                    limits: data.limits,
                    isActive: !data.isActive,
                    isDefault: data.isActive ? false : data.isDefault,
                  },
                })
              }
            >
              {data.isActive ? (
                <>
                  <Icons.circleX className="mr-2 h-4 w-4" /> Deactivate
                </>
              ) : (
                <>
                  <Icons.circleCheck className="mr-2 h-4 w-4" /> Activate
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
