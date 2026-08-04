"use client";
import { AlertModal } from "@/components/modal/alert-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { banIndividualMutation, unbanIndividualMutation } from "../../api/mutations";
import type { PlatformIndividual } from "../../api/types";
import { Icons } from "@/components/icons";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface CellActionProps {
  data: PlatformIndividual;
}

// Ban/Unban only, mirrors features/staff/components/staff-table/cell-action.tsx
// exactly — same real, immediately-enforced authClient.admin.banUser/unbanUser call,
// no reason input (matching that page's own choice not to collect one), no new
// backend. Unlike organizations' Suspend action, there's no flag-only compromise here.
export function CellAction({ data }: CellActionProps) {
  const [banOpen, setBanOpen] = useState(false);

  const ban = useMutation({
    ...banIndividualMutation,
    onSuccess: () => {
      toast.success(`${data.name} has been banned`);
      setBanOpen(false);
    },
    onError: () => toast.error("Failed to ban individual"),
  });

  const unban = useMutation({
    ...unbanIndividualMutation,
    onSuccess: () => toast.success(`${data.name} has been unbanned`),
    onError: () => toast.error("Failed to unban individual"),
  });

  return (
    <>
      <AlertModal
        isOpen={banOpen}
        onClose={() => setBanOpen(false)}
        onConfirm={() => ban.mutate({ userId: data.id })}
        loading={ban.isPending}
      />
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger render={<Button variant="ghost" className="h-8 w-8 p-0" />}>
          <span className="sr-only">Open menu</span>
          <Icons.ellipsis className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Access</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {data.banned ? (
              <DropdownMenuItem onClick={() => unban.mutate(data.id)} disabled={unban.isPending}>
                <Icons.circleCheck className="mr-2 h-4 w-4" /> Unban
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setBanOpen(true)}>
                <Icons.circleX className="mr-2 h-4 w-4" /> Ban
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
