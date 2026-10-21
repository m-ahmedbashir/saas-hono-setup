"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Icons } from "@/components/icons";

// Scope-agnostic — the caller passes the org- or individual-cancel call. Explicit
// destructive confirmation, never a one-click cancel.
export function CancelSubscriptionButton({
  onConfirm,
  isPending,
  error,
}: {
  onConfirm: () => Promise<unknown>;
  isPending: boolean;
  error: Error | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        Cancel subscription
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              Your paid plan ends and you return to the free plan. Your account and data are not
              affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <Alert variant="destructive">
              <Icons.alertCircle className="size-4" />
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Keep subscription</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={async () => {
                try {
                  await onConfirm();
                  setOpen(false);
                } catch {
                  // Surfaced via `error` above; the dialog stays open so it's visible.
                }
              }}
              className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPending && <Spinner className="mr-2 size-4" />}
              {isPending ? "Canceling…" : "Cancel subscription"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
