"use client";

import { useMutation } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { cancelInvitation, describeTeamError } from "../api/service";
import { inviteLink } from "../lib/invite-link";
import { roleLabel } from "../lib/format";
import type { TeamInvitation } from "../types";
import { CopyLinkButton } from "./copy-link-button";

// Only pending, unexpired invitations — Better Auth's full organization includes every
// invitation it has ever recorded (accepted, rejected, canceled) for its own bookkeeping.
export function pendingInvitations(invitations: TeamInvitation[], now = new Date()) {
  return invitations.filter((i) => i.status === "pending" && new Date(i.expiresAt) > now);
}

export function InvitationList({ invitations }: { invitations: TeamInvitation[] }) {
  const cancel = useMutation({ mutationFn: cancelInvitation });

  if (invitations.length === 0) return null;

  return (
    <section aria-labelledby="invitations-heading" className="bg-card rounded-xl border">
      <div className="border-b px-6 py-4">
        <h2 id="invitations-heading" className="text-sm font-medium">
          Pending invitations{" "}
          <span className="text-muted-foreground font-normal">· {invitations.length}</span>
        </h2>
      </div>
      {cancel.error && (
        <Alert variant="destructive" className="m-4 w-auto">
          <Icons.alertCircle className="size-4" />
          <AlertDescription>{describeTeamError(cancel.error)}</AlertDescription>
        </Alert>
      )}
      <ul className="divide-border divide-y">
        {invitations.map((invitation) => (
          <li
            key={invitation.id}
            className="flex min-w-0 flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-full">
                <Icons.mail className="text-muted-foreground size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{invitation.email}</p>
                <p className="text-muted-foreground text-xs">
                  Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                </p>
              </div>
              <Badge variant="outline">{roleLabel(invitation.role)}</Badge>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <CopyLinkButton link={inviteLink(invitation.id)} />
              <Button
                variant="ghost"
                size="sm"
                disabled={cancel.isPending && cancel.variables === invitation.id}
                onClick={() => cancel.mutate(invitation.id)}
                aria-label={`Cancel invitation for ${invitation.email}`}
                className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
