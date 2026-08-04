"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { ApiError } from "@/lib/api-client";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Route-segment error boundary (Next.js convention) — catches the useSuspenseQuery
// throw from OrganizationDetailView. Distinguishes "org doesn't exist" (404, a normal
// outcome — deleted org, mistyped URL) from a real failure, since those need different
// messaging and neither is a bug to log as one.
export default function OrganizationDetailError({ error, reset }: ErrorProps) {
  const notFound = error instanceof ApiError && error.code === "NOT_FOUND";

  useEffect(() => {
    if (!notFound) console.error(error);
  }, [error, notFound]);

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <Icons.alertCircle className="text-destructive h-10 w-10" />
      <h3 className="text-sm font-medium">
        {notFound ? "Organization not found" : "Something went wrong"}
      </h3>
      <p className="text-muted-foreground text-sm">
        {notFound
          ? "This organization may have been removed, or the link is incorrect."
          : "We could not load this organization's details."}
      </p>
      {!notFound && (
        <Button onClick={reset} className="mt-2">
          Retry
        </Button>
      )}
    </div>
  );
}
