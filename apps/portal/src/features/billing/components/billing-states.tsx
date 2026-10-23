"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";

// Matches BillingPanel's real shape (summary block, then a divided plan list) so the
// swap from loading to populated doesn't shift the layout.
export function BillingSkeleton() {
  return (
    <div className="flex w-full flex-col gap-6" aria-busy="true" aria-label="Loading billing">
      <div className="bg-card flex items-center gap-4 rounded-xl border p-6">
        <Skeleton className="size-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
      <div className="bg-card divide-border divide-y rounded-xl border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center justify-between gap-4 p-6">
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-56" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function BillingErrorState({ message, retry }: { message?: string; retry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center"
    >
      <Icons.alertCircle className="text-destructive size-10" />
      <h3 className="mt-4 text-sm font-medium">We couldn&apos;t load your billing</h3>
      <p className="text-muted-foreground mt-1 max-w-sm text-sm break-words">
        {message ?? "Something went wrong. Please try again."}
      </p>
      <Button
        onClick={retry}
        className="focus-visible:ring-ring mt-4 focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        Try again
      </Button>
    </div>
  );
}

export function PlansEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <Icons.billing className="text-muted-foreground size-10" />
      <h3 className="mt-4 text-sm font-medium">No other plans available</h3>
      <p className="text-muted-foreground mt-1 text-sm">
        There are no plans to switch to right now. Check back later.
      </p>
    </div>
  );
}
