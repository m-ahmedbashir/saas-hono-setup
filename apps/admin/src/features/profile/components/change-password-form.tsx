"use client";

import { useState } from "react";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { changePasswordSchema, type ChangePasswordValues } from "../schemas/profile.schema";

export function ChangePasswordForm() {
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useAppForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    } as ChangePasswordValues,
    validators: { onSubmit: changePasswordSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      setSuccess(false);
      // authClient.changePassword also acts on the caller's own session, and requires
      // currentPassword — there is no way for this call to change another account's
      // password even if a userId were guessed.
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
      });
      if (error) {
        setFormError(error.message ?? "Failed to change password");
        return;
      }
      setSuccess(true);
      form.reset();
    },
  });

  return (
    <div className="grid gap-6 p-6 md:grid-cols-3">
      <div className="flex min-w-0 items-start gap-3 md:col-span-1">
        <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icons.lock className="size-4" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Password</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            Update the password used to sign in to your account.
          </p>
        </div>
      </div>
      <div className="md:col-span-2">
        <form.AppForm>
          <form.Form className="mx-0 w-full gap-4 p-0 md:p-0" id="change-password-form">
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
                <AlertTitle>Password changed</AlertTitle>
              </Alert>
            )}
            <form.TextField
              name="currentPassword"
              label="Current password"
              type="password"
              autoComplete="current-password"
            />
            <form.TextField
              name="newPassword"
              label="New password"
              type="password"
              autoComplete="new-password"
            />
            <form.TextField
              name="confirmPassword"
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
            />
            <div className="flex justify-end">
              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <form.SubmitButton>
                    {isSubmitting ? "Saving…" : "Update password"}
                  </form.SubmitButton>
                )}
              </form.Subscribe>
            </div>
          </form.Form>
        </form.AppForm>
      </div>
    </div>
  );
}
