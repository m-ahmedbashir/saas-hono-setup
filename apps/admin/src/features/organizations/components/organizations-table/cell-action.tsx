"use client";
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
import { unbanOrganizationMutation } from "../../api/mutations";
import type { PlatformOrganization } from "../../api/types";
import { Icons } from "@/components/icons";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BanOrganizationModal } from "../ban-organization-modal";

interface CellActionProps {
  data: PlatformOrganization;
}

export function CellAction({ data }: CellActionProps) {
  const [banOpen, setBanOpen] = useState(false);

  const unban = useMutation({
    ...unbanOrganizationMutation,
    onSuccess: () => toast.success(`${data.name} has been unsuspended`),
    onError: () => toast.error("Failed to unsuspend organization"),
  });

  return (
    <>
      <BanOrganizationModal
        isOpen={banOpen}
        onClose={() => setBanOpen(false)}
        organizationId={data.id}
        organizationName={data.name}
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
            {data.suspended ? (
              <DropdownMenuItem onClick={() => unban.mutate(data.id)} disabled={unban.isPending}>
                <Icons.circleCheck className="mr-2 h-4 w-4" /> Unsuspend
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setBanOpen(true)}>
                <Icons.circleX className="mr-2 h-4 w-4" /> Suspend Organization
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
