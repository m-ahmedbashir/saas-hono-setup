"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { updateNameSchema, type UpdateNameValues } from "../schemas/profile.schema";

export function UpdateNameForm({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useAppForm({
    defaultValues: { name: currentName } as UpdateNameValues,
    validators: { onSubmit: updateNameSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setSuccess(false);
      // authClient.updateUser acts on the caller's own session — there is no user id
      // parameter to pass, so it's impossible for this call to touch another account.
      const { error } = await authClient.updateUser({ name: value.name });
      if (error) {
        setFormError(error.message ?? "Failed to update name");
        return;
      }
      setSuccess(true);
      router.refresh();
    },
  });

  return (
    <div className="grid gap-6 p-6 md:grid-cols-3">
      <div className="flex min-w-0 items-start gap-3 md:col-span-1">
        <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icons.user className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Public profile</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            This name is shown across the dashboard wherever your account appears.
          </p>
        </div>
      </div>
      <div className="md:col-span-2">
        <form.AppForm>
          <form.Form className="mx-0 w-full gap-4 p-0 md:p-0" id="update-name-form">
            {formError && (
              <Alert variant="destructive">
                <Icons.alertCircle className="size-4" />
                <AlertTitle>Update failed</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert>
                <Icons.check className="size-4" />
                <AlertTitle>Name updated</AlertTitle>
              </Alert>
            )}
            <form.TextField name="name" label="Full name" autoComplete="name" />
            <div className="flex justify-end">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <form.SubmitButton>{isSubmitting ? "Saving…" : "Save changes"}</form.SubmitButton>
                )}
              </form.Subscribe>
            </div>
          </form.Form>
        </form.AppForm>
      </div>
    </div>
  );
}
