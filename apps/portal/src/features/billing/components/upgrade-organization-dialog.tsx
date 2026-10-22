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
import { Icons } from "@/components/icons";
import { organizationCheckoutMutation } from "../api/mutations";
import type { OrganizationPlanOption } from "../api/types";
import { useCheckoutAttemptKey } from "../hooks/use-checkout-attempt-key";
import { seatQuantitySchema, type SeatQuantityValues } from "../schemas/seat-quantity.schema";

export function UpgradeOrganizationDialog({
  plan,
  memberCount,
}: {
  plan: OrganizationPlanOption;
  /** The caller only offers plans whose seatLimit fits this, so the default is always valid. */
  memberCount: number;
}) {
  const [open, setOpen] = useState(false);
  const keyFor = useCheckoutAttemptKey();
  const checkout = useMutation(organizationCheckoutMutation);

  const form = useAppForm({
    defaultValues: { seats: Math.max(memberCount, 1) } as SeatQuantityValues,
    validators: { onSubmit: seatQuantitySchema({ memberCount, seatLimit: plan.seatLimit }) },
    onSubmit: async ({ value }) => {
      // Same key for every retry of this plan + seat count; a different seat count is a
      // different request to Stripe, so it gets its own attempt (and key).
      const idempotencyKey = keyFor(`${plan.planId}:${value.seats}`);
      try {
        const { checkoutUrl } = await checkout.mutateAsync({
          planId: plan.planId,
          quantity: value.seats,
          idempotencyKey,
        });
        window.location.assign(checkoutUrl);
      } catch {
        // Surfaced via checkout.error in the dialog; nothing else to do.
      }
    },
  });

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        Choose plan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to {plan.name}</DialogTitle>
            <DialogDescription>
              Choose how many seats to pay for. You&apos;ll confirm payment on Stripe&apos;s secure
              checkout page.
            </DialogDescription>
          </DialogHeader>
          <form.AppForm>
            <form.Form className="mx-0 w-full gap-4 p-0 md:p-0">
              {checkout.error && (
                <Alert variant="destructive">
                  <Icons.alertCircle className="size-4" />
                  <AlertDescription>{checkout.error.message}</AlertDescription>
                </Alert>
              )}
              <form.TextField
                name="seats"
                label="Seats"
                type="number"
                min={Math.max(memberCount, 1)}
                max={plan.seatLimit ?? undefined}
                inputMode="numeric"
                description={
                  plan.seatLimit != null
                    ? `This plan allows up to ${plan.seatLimit} members.`
                    : undefined
                }
              />
              <div className="flex justify-end">
                <form.Subscribe selector={(state) => state.isSubmitting}>
                  {(isSubmitting) => (
                    <form.SubmitButton>
                      {isSubmitting ? "Redirecting to checkout…" : "Continue to checkout"}
                    </form.SubmitButton>
                  )}
                </form.Subscribe>
              </div>
            </form.Form>
          </form.AppForm>
        </DialogContent>
      </Dialog>
    </>
  );
}
