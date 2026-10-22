import { isLiveSubscription } from "@repo/core/billing/subscription-status";
import { Badge } from "@/components/ui/badge";
import { Icons } from "@/components/icons";
import type { SubscriptionStatus } from "../api/types";

type LiveStatus = Exclude<SubscriptionStatus, "canceled">;

const statusLabel: Record<LiveStatus, string> = {
  active: "Active",
  past_due: "Payment overdue",
  incomplete: "Payment pending",
};

const statusVariant: Record<LiveStatus, "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  past_due: "destructive",
  incomplete: "outline",
};

// Once a subscription ends, the webhook returns the row to the default plan — so a
// "Canceled" badge next to that plan's name would misdescribe it; say what happened instead.
// A null status covers both the free tier and a plan staff arranged outside checkout, so
// it makes no claim about which.
function describe(status: SubscriptionStatus | null): string {
  return status === "canceled" ? "Your previous subscription has ended" : "Your current plan";
}

export function CurrentPlanSummary({
  planName,
  status,
  seatQuantity,
  action,
}: {
  planName: string;
  status: SubscriptionStatus | null;
  /** Organization billing only — individual billing has no seat concept. */
  seatQuantity?: number | null;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card flex min-w-0 flex-col gap-4 rounded-xl border p-6 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Icons.creditCard className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{planName}</h2>
            {status && status !== "canceled" && (
              <Badge variant={statusVariant[status]}>{statusLabel[status]}</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {describe(status)}
            {/* Only meaningful while seats are actually being billed. */}
            {isLiveSubscription(status) && seatQuantity
              ? ` · ${seatQuantity} ${seatQuantity === 1 ? "seat" : "seats"}`
              : ""}
          </p>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
