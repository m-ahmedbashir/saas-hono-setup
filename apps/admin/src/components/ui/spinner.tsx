import { Icons } from "@/components/icons";

import { cn } from "@repo/shared/utils";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Icons.spinner
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
