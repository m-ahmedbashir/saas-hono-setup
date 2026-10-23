"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { resetPasswordSchema, type ResetPasswordValues } from "../schemas/reset-password.schema";
import { AuthCard } from "./auth-card";

const requestNewLink = (
  <Link href="/auth/forgot-password" className="text-sm underline underline-offset-4">
    Request a new link
  </Link>
);

/** `token`: the emailed link's `?token=` — single-use; Better Auth validates it. */
export function ResetPasswordView({ token }: { token?: string } = {}) {
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tokenRejected, setTokenRejected] = useState(false);

  const form = useAppForm({
    defaultValues: { password: "", confirmPassword: "" } as ResetPasswordValues,
    validators: { onSubmit: resetPasswordSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const { error } = await authClient.resetPassword({ newPassword: value.password, token });
      if (!error) {
        setDone(true);
        return;
      }
      if (error.code === "INVALID_TOKEN") setTokenRejected(true);
      else setFormError(error.message ?? "Couldn't change your password. Try again.");
    },
  });

  if (!token) {
    return (
      <AuthCard
        title="Reset link not valid"
        description="This link is incomplete. Open the full link from the email, or request a new one."
      >
        {requestNewLink}
      </AuthCard>
    );
  }

  if (tokenRejected) {
    return (
      <AuthCard
        title="Reset link not valid"
        description="This link has expired or was already used. Reset links work once, for 1 hour."
      >
        {requestNewLink}
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard title="Password changed" description="Sign in with your new password.">
        <Link href="/auth/sign-in" className={buttonVariants({ className: "w-full" })}>
          Sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form.AppForm>
        <form.Form className="gap-4" id="reset-password-form">
          {formError && (
            <Alert variant="destructive">
              <Icons.alertCircle className="size-4" />
              <AlertTitle>Password not changed</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <form.TextField
            name="password"
            label="New password"
            type="password"
            icon={Icons.lock}
            autoComplete="new-password"
            autoFocus
          />
          <form.TextField
            name="confirmPassword"
            label="Confirm new password"
            type="password"
            icon={Icons.lock}
            autoComplete="new-password"
          />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <form.SubmitButton className="w-full" size="lg">
                {isSubmitting ? "Saving…" : "Set new password"}
              </form.SubmitButton>
            )}
          </form.Subscribe>
        </form.Form>
      </form.AppForm>
    </AuthCard>
  );
}
