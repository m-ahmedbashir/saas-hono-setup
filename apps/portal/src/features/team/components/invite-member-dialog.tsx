"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAppForm } from "@/components/ui/tanstack-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icons } from "@/components/icons";
import { describeTeamError, inviteMember } from "../api/service";
import { inviteLink } from "../lib/invite-link";
import { inviteSchema, roleOptions, type InviteValues } from "../schemas/invite.schema";
import { CopyLinkButton } from "./copy-link-button";

export function InviteMemberDialog() {
  const [open, setOpen] = useState(false);
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const invite = useMutation({ mutationFn: inviteMember });

  const form = useAppForm({
    defaultValues: { email: "", role: "member" } as InviteValues,
    validators: { onSubmit: inviteSchema },
    onSubmit: async ({ value }) => {
      try {
        const invitation = await invite.mutateAsync(value);
        setCreatedLink(inviteLink(invitation.id));
      } catch {
        // Surfaced via invite.error below.
      }
    },
  });

  function close(next: boolean) {
    setOpen(next);
    if (!next) {
      setCreatedLink(null);
      invite.reset();
      form.reset();
    }
  }

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        <Icons.add className="mr-1.5 size-4" />
        Invite member
      </Button>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent>
          {createdLink ? (
            <>
              <DialogHeader>
                <DialogTitle>Invitation created</DialogTitle>
                <DialogDescription>
                  Send this link to the person you invited. It only works for the email address you
                  entered.
                </DialogDescription>
              </DialogHeader>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  readOnly
                  value={createdLink}
                  aria-label="Invitation link"
                  className="min-w-0"
                />
                <CopyLinkButton link={createdLink} label="Copy" />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => close(false)}>
                  Done
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Invite a member</DialogTitle>
                <DialogDescription>
                  You&apos;ll get a link to share with them. Each person you invite uses one seat on
                  your plan.
                </DialogDescription>
              </DialogHeader>
              <form.AppForm>
                <form.Form className="mx-0 w-full gap-4 p-0 md:p-0">
                  {invite.error && (
                    <Alert variant="destructive">
                      <Icons.alertCircle className="size-4" />
                      <AlertDescription>{describeTeamError(invite.error)}</AlertDescription>
                    </Alert>
                  )}
                  <form.TextField
                    name="email"
                    label="Email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="teammate@example.com"
                  />
                  <form.SelectField name="role" label="Role" options={roleOptions} />
                  <div className="flex justify-end">
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <form.SubmitButton>
                          {isSubmitting ? "Creating invitation…" : "Create invitation"}
                        </form.SubmitButton>
                      )}
                    </form.Subscribe>
                  </div>
                </form.Form>
              </form.AppForm>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
