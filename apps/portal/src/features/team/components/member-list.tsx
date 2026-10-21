"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/icons";
import { describeTeamError, removeMember, updateMemberRole } from "../api/service";
import { initials, roleLabel } from "../lib/format";
import type { TeamMember } from "../types";

export function MemberList({
  members,
  currentUserId,
  canManage,
}: {
  members: TeamMember[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [toRemove, setToRemove] = useState<TeamMember | null>(null);
  const changeRole = useMutation({ mutationFn: updateMemberRole });
  const remove = useMutation({ mutationFn: removeMember });
  const error = changeRole.error ?? (toRemove ? null : remove.error);

  return (
    <section aria-labelledby="members-heading" className="bg-card rounded-xl border">
      <div className="border-b px-6 py-4">
        <h2 id="members-heading" className="text-sm font-medium">
          Members <span className="text-muted-foreground font-normal">· {members.length}</span>
        </h2>
      </div>
      {error && (
        <Alert variant="destructive" className="m-4 w-auto">
          <Icons.alertCircle className="size-4" />
          <AlertDescription>{describeTeamError(error)}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-border divide-y">
        {members.map((member) => {
          // The owner and your own row get no actions: Better Auth refuses changes to the
          // owner and self-removal goes through "leave", so offering them would only fail.
          const manageable =
            canManage && member.role !== "owner" && member.userId !== currentUserId;
          return (
            <li key={member.id} className="flex min-w-0 items-center gap-4 px-6 py-4">
              <Avatar className="size-9 shrink-0">
                <AvatarImage src={member.user.image ?? undefined} alt={member.user.name} />
                <AvatarFallback className="text-xs">{initials(member.user.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {member.user.name}
                  {member.userId === currentUserId && (
                    <span className="text-muted-foreground font-normal"> (you)</span>
                  )}
                </p>
                <p className="text-muted-foreground truncate text-sm">{member.user.email}</p>
              </div>
              <Badge variant={member.role === "member" ? "outline" : "secondary"}>
                {roleLabel(member.role)}
              </Badge>
              {manageable ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Actions for ${member.user.name}`}
                        className="focus-visible:ring-ring shrink-0 focus-visible:ring-2 focus-visible:ring-offset-2"
                      />
                    }
                  >
                    <Icons.ellipsis className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        changeRole.mutate({
                          memberId: member.id,
                          role: member.role === "admin" ? "member" : "admin",
                        })
                      }
                    >
                      {member.role === "admin" ? "Make member" : "Make admin"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        remove.reset();
                        setToRemove(member);
                      }}
                    >
                      Remove from team
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                // Keeps every row's columns aligned whether or not it has actions.
                <span className="size-9 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>

      <AlertDialog open={toRemove !== null} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toRemove?.user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access to this organization right away. Their own account isn&apos;t
              affected, and you can invite them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {remove.error && (
            <Alert variant="destructive">
              <Icons.alertCircle className="size-4" />
              <AlertDescription>{describeTeamError(remove.error)}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Keep</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() =>
                toRemove && remove.mutate(toRemove.id, { onSuccess: () => setToRemove(null) })
              }
              className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {remove.isPending ? "Removing…" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
