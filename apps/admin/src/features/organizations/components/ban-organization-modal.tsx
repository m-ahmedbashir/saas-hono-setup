"use client";

import { useEffect, useState } from "react";
import { useAppForm, useFormFields } from "@/components/ui/tanstack-form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Icons } from "@/components/icons";
import { useMutation } from "@tanstack/react-query";
import { banOrganizationMutation } from "../api/mutations";
import { toast } from "sonner";
import { banOrganizationSchema, type BanOrganizationFormValues } from "../schemas/organization";

interface BanOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
}

// Built on the shared Modal (@/components/ui/modal), not AlertModal — AlertModal is a
// plain yes/no confirm with no input capability, and a ban needs an optional reason
// field. Same isMounted guard as AlertModal (avoids a hydration mismatch on first
// client render).
export function BanOrganizationModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
}: BanOrganizationModalProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const banMutation = useMutation({
    ...banOrganizationMutation,
    onSuccess: () => {
      toast.success(`${organizationName} has been suspended`);
      onClose();
      form.reset();
    },
    onError: (error) => toast.error(error.message || "Failed to suspend organization"),
  });

  const form = useAppForm({
    defaultValues: { reason: "" } as BanOrganizationFormValues,
    validators: { onSubmit: banOrganizationSchema },
    onSubmit: async ({ value }) => {
      await banMutation.mutateAsync({ organizationId, reason: value.reason || undefined });
    },
  });

  const { FormTextareaField } = useFormFields<BanOrganizationFormValues>();

  if (!isMounted) {
    return null;
  }

  return (
    <Modal
      title={`Suspend ${organizationName}?`}
      description="Flag-only for now — this records the suspension and reason but doesn't block the organization's access yet."
      isOpen={isOpen}
      onClose={onClose}
    >
      <form.AppForm>
        <form.Form id="ban-organization-form" className="space-y-4">
          <FormTextareaField
            name="reason"
            label="Reason (optional)"
            placeholder="e.g. Chargeback dispute under review"
            description="Visible to other platform admins/support, not to the organization."
          />
        </form.Form>
      </form.AppForm>

      <div className="flex w-full items-center justify-end space-x-2 pt-6">
        <Button disabled={banMutation.isPending} variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          form="ban-organization-form"
          variant="destructive"
          isLoading={banMutation.isPending}
        >
          <Icons.circleX /> Suspend Organization
        </Button>
      </div>
    </Modal>
  );
}
