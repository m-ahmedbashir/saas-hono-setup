"use client";

import { useSearchParams } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";

// Stripe Checkout returns here with ?checkout=success|cancelled (stripe-billing.service.ts's
// success_url/cancel_url). "success" means payment went through on Stripe's side; the plan
// shown below changes once Stripe's webhook reaches apps/api, which can lag a few seconds.
export function CheckoutStatusNotice() {
  const checkout = useSearchParams().get("checkout");

  if (checkout === "success") {
    return (
      <Alert>
        <Icons.circleCheck className="size-4" />
        <AlertTitle>Payment received</AlertTitle>
        <AlertDescription>
          Thanks! Your new plan appears here as soon as Stripe confirms it. This usually takes a few
          seconds; refresh if it hasn&apos;t changed.
        </AlertDescription>
      </Alert>
    );
  }
  if (checkout === "cancelled") {
    return (
      <Alert>
        <Icons.info className="size-4" />
        <AlertTitle>Checkout cancelled</AlertTitle>
        <AlertDescription>No payment was taken. Your plan is unchanged.</AlertDescription>
      </Alert>
    );
  }
  return null;
}
