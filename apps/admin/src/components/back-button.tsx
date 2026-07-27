"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

interface BackButtonProps {
  fallbackHref: string;
}

// router.back() only makes sense if there's actually somewhere within this app to
// land on — a direct link/bookmark/new-tab open has browser history but nothing of
// ours to go back to. document.referrer's origin is the signal for "did navigation
// actually originate from this app," not window.history.length (that counts every
// entry in the tab, including pages from before this app was ever opened). Shared
// across every detail page (organizations, individuals, ...) — not feature-specific.
export function BackButton({ fallbackHref }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    let cameFromWithinApp = false;
    if (typeof document !== "undefined" && document.referrer) {
      try {
        cameFromWithinApp = new URL(document.referrer).origin === window.location.origin;
      } catch {
        cameFromWithinApp = false;
      }
    }

    if (cameFromWithinApp) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="focus-visible:ring-ring w-fit focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <Icons.chevronLeft className="mr-1 h-4 w-4" /> Back
    </Button>
  );
}
