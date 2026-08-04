"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { ApiError } from "@/lib/api-client";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Route-segment error boundary — same reasoning as organizations' detail error.tsx:
// distinguishes "doesn't exist" (404 — a staff account id, a deleted user, or a
// mistyped link, all normal outcomes per apps/api's partitioning) from a real failure.
export default function IndividualDetailError({ error, reset }: ErrorProps) {
  const notFound = error instanceof ApiError && error.code === "NOT_FOUND";

  useEffect(() => {
    if (!notFound) console.error(error);
  }, [error, notFound]);

  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center">
      <Icons.alertCircle className="text-destructive h-10 w-10" />
      <h3 className="text-sm font-medium">
        {notFound ? "Individual not found" : "Something went wrong"}
      </h3>
      <p className="text-muted-foreground text-sm">
        {notFound
          ? "This account may have been removed, is a platform staff account, or the link is incorrect."
          : "We could not load this individual's details."}
      </p>
      {!notFound && (
        <Button onClick={reset} className="mt-2">
          Retry
        </Button>
      )}
    </div>
  );
}
