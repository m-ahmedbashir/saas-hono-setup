"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAppForm, useFormFields } from "@/components/ui/tanstack-form";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { toast } from "sonner";
import { createSubscriptionPlanMutation, updateSubscriptionPlanMutation } from "../api/mutations";
import { subscriptionPlanDetailQueryOptions } from "../api/queries";
import type { SubscriptionPlan } from "../api/types";
import {
  subscriptionPlanFormSchema,
  type SubscriptionPlanFormValues,
} from "../schemas/subscription-plan";
import {
  featureKeys,
  limitKeys,
  FEATURE_LABELS,
  LIMIT_LABELS,
  OWNER_TYPE_OPTIONS,
} from "../options";

interface SubscriptionPlanFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Undefined = create a new plan. Defined = editing this existing plan. */
  plan?: SubscriptionPlan;
}

function toFormValues(plan?: SubscriptionPlan): SubscriptionPlanFormValues {
  const features = Object.fromEntries(
    featureKeys.map((key) => [key, plan?.features[key] ?? false]),
  );
  const limits = Object.fromEntries(limitKeys.map((key) => [key, plan?.limits[key] ?? 0]));

  return {
    ownerType: plan?.ownerType ?? "organization",
    planId: plan?.planId ?? "",
    organizationId: plan?.organizationId ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    seatLimit: plan?.seatLimit ?? "",
    providerPriceId: plan?.providerPriceId ?? "",
    features,
    limits,
    isActive: plan?.isActive ?? true,
    isDefault: plan?.isDefault ?? false,
  };
}

export function SubscriptionPlanFormSheet({
  open,
  onOpenChange,
  plan,
}: SubscriptionPlanFormSheetProps) {
  const isEditing = plan !== undefined;
  const [formError, setFormError] = useState<string | null>(null);

  // Only needed for the price-change warning below — the row data the table already
  // passed in (`plan`) covers every other field. Skipped entirely in create mode.
  const { data: detail } = useQuery({
    ...subscriptionPlanDetailQueryOptions(plan?.id ?? ""),
    enabled: isEditing && open,
  });

  const createMutation = useMutation({
    ...createSubscriptionPlanMutation,
    onSuccess: () => {
      toast.success("Plan created");
      onOpenChange(false);
    },
    onError: (error) => setFormError(error.message || "Failed to create plan"),
  });

  const updateMutation = useMutation({
    ...updateSubscriptionPlanMutation,
    onSuccess: () => {
      toast.success("Plan updated");
      onOpenChange(false);
    },
    onError: (error) => setFormError(error.message || "Failed to update plan"),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const form = useAppForm({
    defaultValues: toFormValues(plan),
    validators: { onSubmit: subscriptionPlanFormSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const seatLimit = value.seatLimit === "" ? undefined : value.seatLimit;

      if (isEditing) {
        await updateMutation.mutateAsync({
          id: plan.id,
          payload: {
            name: value.name,
            description: value.description || undefined,
            seatLimit,
            providerPriceId: value.providerPriceId || undefined,
            features: value.features,
            limits: value.limits,
            isActive: value.isActive,
            isDefault: value.isDefault,
          },
        });
      } else {
        await createMutation.mutateAsync({
          ownerType: value.ownerType,
          planId: value.planId,
          organizationId: value.organizationId || undefined,
          name: value.name,
          description: value.description || undefined,
          seatLimit,
          providerPriceId: value.providerPriceId || undefined,
          features: value.features,
          limits: value.limits,
          isActive: value.isActive,
          isDefault: value.isDefault,
        });
      }
    },
  });

  const { FormTextField, FormSwitchField, FormSelectField } =
    useFormFields<SubscriptionPlanFormValues>();

  // Item 5: editing providerPriceId never touches subscribers already on the plan —
  // surfaced here instead of left as a doc-only note.
  const priceChanged =
    isEditing && form.state.values.providerPriceId !== (plan.providerPriceId ?? "");
  const showPriceWarning = priceChanged && (detail?.activeSubscriberCount ?? 0) > 0;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) setFormError(null);
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Plan" : "New Plan"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Changing features or limits takes effect immediately for every current subscriber on this plan."
              : "Leave Organization ID blank for a shared plan any org can subscribe to. Set it to create a custom plan for one organization only."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-auto px-1">
          {formError && (
            <Alert variant="destructive">
              <Icons.alertCircle className="size-4" />
              <AlertTitle>Couldn&apos;t save this plan</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          {showPriceWarning && (
            <Alert>
              <Icons.alertCircle className="size-4" />
              <AlertTitle>Price change won&apos;t affect current subscribers</AlertTitle>
              <AlertDescription>
                {detail?.activeSubscriberCount} active subscription(s) on this plan will keep their
                existing Stripe price — this only changes what new checkouts use.
              </AlertDescription>
            </Alert>
          )}

          <form.AppForm>
            <form.Form id="subscription-plan-form-sheet" className="space-y-4">
              {isEditing ? (
                // ownerType/planId/organizationId are immutable after creation (the
                // update schema omits all three) — shown read-only rather than as
                // disabled form fields, so it's clear editing them here would do
                // nothing rather than looking like a bug.
                <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Applies To</div>
                    <div className="font-medium capitalize">{plan.ownerType}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Plan ID</div>
                    <div className="font-medium">{plan.planId}</div>
                  </div>
                  {plan.organizationId && (
                    <div className="col-span-2">
                      <div className="text-muted-foreground">Organization ID</div>
                      <div className="font-medium">{plan.organizationId}</div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <FormSelectField
                    name="ownerType"
                    label="Applies To"
                    required
                    options={OWNER_TYPE_OPTIONS}
                    placeholder="Select ownership type"
                  />

                  <FormTextField
                    name="planId"
                    label="Plan ID"
                    required
                    placeholder="starter"
                    description="Lowercase letters, numbers, hyphens, or underscores. Immutable after creation."
                  />

                  <FormTextField
                    name="organizationId"
                    label="Organization ID (optional)"
                    placeholder="Leave blank for a shared plan"
                    description="Set this to make the plan private to one organization — copy the ID from its row on the Organizations page."
                  />
                </>
              )}

              <FormTextField name="name" label="Name" required placeholder="Starter" />

              <FormTextField
                name="description"
                label="Description (optional)"
                placeholder="A short internal description"
              />

              <FormTextField
                name="seatLimit"
                label="Seat Limit (organization plans only)"
                type="number"
                placeholder="10"
              />

              <FormTextField
                name="providerPriceId"
                label="Stripe Price ID (optional)"
                placeholder="price_..."
                description="Verified against Stripe before this plan is saved."
              />

              <fieldset className="space-y-3 rounded-lg border p-4">
                <legend className="text-sm font-medium">Features</legend>
                {featureKeys.map((key) => (
                  <FormSwitchField key={key} name={`features.${key}`} label={FEATURE_LABELS[key]} />
                ))}
              </fieldset>

              <fieldset className="space-y-4 rounded-lg border p-4">
                <legend className="text-sm font-medium">Limits</legend>
                {limitKeys.map((key) => (
                  <FormTextField
                    key={key}
                    name={`limits.${key}`}
                    label={LIMIT_LABELS[key]}
                    type="number"
                  />
                ))}
              </fieldset>

              <FormSwitchField
                name="isActive"
                label="Active"
                description="Inactive plans stop appearing as an option for new checkouts. Existing subscribers are unaffected."
              />

              <FormSwitchField
                name="isDefault"
                label="Default plan"
                description="The plan a new signup with no billing row yet resolves to. Only one shared plan per type may be default."
              />
            </form.Form>
          </form.AppForm>
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="subscription-plan-form-sheet" isLoading={isPending}>
            <Icons.check /> {isEditing ? "Save Changes" : "Create Plan"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function SubscriptionPlanFormSheetTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Icons.add className="mr-2 h-4 w-4" /> New Plan
      </Button>
      <SubscriptionPlanFormSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
