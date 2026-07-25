"use client";
import { AlertModal } from "@/components/modal/alert-modal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  setUserRoleMutation,
  banUserMutation,
  unbanUserMutation,
  removeUserMutation,
} from "../../api/mutations";
import type { PlatformUser } from "../../api/types";
import { Icons } from "@/components/icons";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

interface CellActionProps {
  data: PlatformUser;
}

export function CellAction({ data }: CellActionProps) {
  const [removeOpen, setRemoveOpen] = useState(false);
  const [banOpen, setBanOpen] = useState(false);

  const setRole = useMutation({
    ...setUserRoleMutation,
    onSuccess: () => toast.success(`Role updated for ${data.name}`),
    onError: () => toast.error("Failed to update role"),
  });

  const ban = useMutation({
    ...banUserMutation,
    onSuccess: () => {
      toast.success(`${data.name} has been banned`);
      setBanOpen(false);
    },
    onError: () => toast.error("Failed to ban user"),
  });

  const unban = useMutation({
    ...unbanUserMutation,
    onSuccess: () => toast.success(`${data.name} has been unbanned`),
    onError: () => toast.error("Failed to unban user"),
  });

  const remove = useMutation({
    ...removeUserMutation,
    onSuccess: () => {
      toast.success(`${data.name} has been removed`);
      setRemoveOpen(false);
    },
    onError: () => toast.error("Failed to remove user"),
  });

  return (
    <>
      <AlertModal
        isOpen={removeOpen}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => remove.mutate(data.id)}
        loading={remove.isPending}
      />
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
            <DropdownMenuLabel>Role</DropdownMenuLabel>
            <DropdownMenuItem
              disabled={data.role === "admin"}
              onClick={() => setRole.mutate({ userId: data.id, role: "admin" })}
            >
              <Icons.pro className="mr-2 h-4 w-4" /> Make admin
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={data.role === "support"}
              onClick={() => setRole.mutate({ userId: data.id, role: "support" })}
            >
              <Icons.user className="mr-2 h-4 w-4" /> Make support
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Access</DropdownMenuLabel>
            {data.banned ? (
              <DropdownMenuItem onClick={() => unban.mutate(data.id)}>
                <Icons.circleCheck className="mr-2 h-4 w-4" /> Unban
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => setBanOpen(true)}>
                <Icons.circleX className="mr-2 h-4 w-4" /> Ban
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setRemoveOpen(true)}>
              <Icons.trash className="mr-2 h-4 w-4" /> Remove
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
