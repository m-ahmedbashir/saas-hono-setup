import { Badge } from "@/components/ui/badge";
import { PlansEmptyState } from "./billing-states";

interface PlanOptionBase {
  planId: string;
  name: string;
  description: string | null;
  seatLimit?: number | null;
}

// Presentational only — what each row's action *does* (org dialog vs. direct individual
// checkout, or nothing for a member without billing:manage) is decided by the caller.
export function PlanOptionList<T extends PlanOptionBase>({
  plans,
  currentPlanId,
  renderAction,
}: {
  plans: T[];
  currentPlanId: string;
  renderAction: (plan: T) => React.ReactNode;
}) {
  return (
    <section aria-labelledby="available-plans-heading" className="bg-card rounded-xl border">
      <div className="border-b px-6 py-4">
        <h2 id="available-plans-heading" className="text-sm font-medium">
          Available plans
        </h2>
      </div>
      {plans.length === 0 ? (
        <PlansEmptyState />
      ) : (
        <ul className="divide-border divide-y">
          {plans.map((plan) => {
            const isCurrent = plan.planId === currentPlanId;
            return (
              <li
                key={plan.planId}
                className="flex min-w-0 flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="truncate text-sm font-medium">{plan.name}</h3>
                    {isCurrent && <Badge variant="outline">Current plan</Badge>}
                  </div>
                  {plan.description && (
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {plan.description}
                    </p>
                  )}
                  {plan.seatLimit != null && (
                    <p className="text-muted-foreground mt-1 text-xs">
                      Up to {plan.seatLimit} {plan.seatLimit === 1 ? "member" : "members"}
                    </p>
                  )}
                </div>
                {!isCurrent && <div className="shrink-0">{renderAction(plan)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
