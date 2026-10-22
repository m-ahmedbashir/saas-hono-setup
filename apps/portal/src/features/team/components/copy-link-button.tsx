"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";

export function CopyLinkButton({ link, label = "Copy link" }: { link: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {copied ? (
        <Icons.check className="mr-1.5 size-4" />
      ) : (
        <Icons.share className="mr-1.5 size-4" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}
