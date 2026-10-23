"use client";

import { useMutation } from "@tanstack/react-query";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { describeOrganizationError, renameOrganization } from "../api/service";
import {
  organizationNameSchema,
  type OrganizationNameValues,
} from "../schemas/organization-profile.schema";

// No cache to update by hand: Better Auth's client refetches the active organization after
// every /organization/* call, so the nav, switcher and this page all pick up the new name.
export function OrganizationNameForm({
  organizationId,
  currentName,
}: {
  organizationId: string;
  currentName: string;
}) {
  const rename = useMutation({ mutationFn: renameOrganization });

  const form = useAppForm({
    defaultValues: { name: currentName } as OrganizationNameValues,
    validators: { onSubmit: organizationNameSchema },
    onSubmit: async ({ value }) => {
      try {
        await rename.mutateAsync({ organizationId, name: value.name.trim() });
      } catch {
        // Surfaced via rename.error below.
      }
    },
  });

  return (
    <form.AppForm>
      <form.Form className="mx-0 w-full gap-4 p-0 md:p-0" id="organization-name-form">
        {rename.error && (
          <Alert variant="destructive">
            <Icons.alertCircle className="size-4" />
            <AlertDescription>{describeOrganizationError(rename.error)}</AlertDescription>
          </Alert>
        )}
        {rename.isSuccess && (
          <Alert>
            <Icons.check className="size-4" />
            <AlertTitle>Name updated</AlertTitle>
          </Alert>
        )}
        <form.TextField name="name" label="Organization name" autoComplete="organization" />
        <div className="flex justify-end">
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <form.SubmitButton>{isSubmitting ? "Saving…" : "Save name"}</form.SubmitButton>
            )}
          </form.Subscribe>
        </div>
      </form.Form>
    </form.AppForm>
  );
}
