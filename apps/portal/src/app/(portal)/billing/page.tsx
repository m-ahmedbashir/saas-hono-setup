import { Suspense } from "react";
import type { Metadata } from "next";
import { BillingView } from "@/features/billing/components/billing-view";
import { BillingSkeleton } from "@/features/billing/components/billing-states";

export const metadata: Metadata = {
  title: "Billing",
};

// Suspense is required, not decorative: BillingView reads useSearchParams() (the
// ?checkout= return from Stripe), which Next.js needs a boundary around to prerender.
export default function BillingPage() {
  return (
    <Suspense fallback={<BillingSkeleton />}>
      <BillingView />
    </Suspense>
  );
}
