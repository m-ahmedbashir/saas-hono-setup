// Backed by apps/api's own /subscription-plans module — the admin-editable plan
// catalog that replaced the hardcoded organizationPlans/individualPlans maps. See
// specs/subscription-management-plan.md.
export interface SubscriptionPlan {
  id: string;
  ownerType: "organization" | "individual";
  planId: string;
  organizationId: string | null;
  name: string;
  description: string | null;
  seatLimit: number | null;
  providerPriceId: string | null;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  isActive: boolean;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// GET /:id only — activeSubscriberCount would mean an extra aggregate per row on the
// list endpoint (N+1 or a more complex batched query) for a number only the edit
// sheet's price-change warning (item 5) actually needs; not built until the list view
// needs it too.
export interface SubscriptionPlanDetail extends SubscriptionPlan {
  activeSubscriberCount: number;
}

export type SubscriptionPlanFilters = {
  ownerType?: "organization" | "individual";
  isActive?: boolean;
};

export type SubscriptionPlansResponse = {
  plans: SubscriptionPlan[];
};

export type CreateSubscriptionPlanPayload = {
  ownerType: "organization" | "individual";
  planId: string;
  organizationId?: string;
  name: string;
  description?: string;
  seatLimit?: number;
  providerPriceId?: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
  isActive: boolean;
  isDefault: boolean;
};

export type UpdateSubscriptionPlanPayload = Omit<
  CreateSubscriptionPlanPayload,
  "ownerType" | "planId" | "organizationId"
>;
