"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { forgotPasswordSchema, type ForgotPasswordValues } from "../schemas/forgot-password.schema";
import { AuthCard } from "./auth-card";

export function ForgotPasswordView() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: "" } as ForgotPasswordValues,
    validators: { onSubmit: forgotPasswordSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      // No redirectTo: apps/api builds the emailed link from PORTAL_URL itself.
      const { error } = await authClient.requestPasswordReset({ email: value.email });
      if (error) {
        setFormError(
          error.status === 429
            ? "Too many attempts. Wait a minute, then try again."
            : (error.message ?? "Couldn't send the reset link. Try again."),
        );
        return;
      }
      setSentTo(value.email);
    },
  });

  if (sentTo) {
    // Worded the same whether or not the account exists — apps/api answers both alike.
    return (
      <AuthCard title="Check your email">
        <p className="text-sm">
          If an account exists for {sentTo}, we&apos;ve sent a link to reset its password. The link
          expires in 1 hour.
        </p>
        <Link href="/auth/sign-in" className="text-sm underline underline-offset-4">
          Back to sign in
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Enter your account's email and we'll send you a link to reset it."
    >
      <form.AppForm>
        <form.Form className="gap-4" id="forgot-password-form">
          {formError && (
            <Alert variant="destructive">
              <Icons.alertCircle className="size-4" />
              <AlertTitle>Reset link not sent</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <form.TextField
            name="email"
            label="Email"
            type="email"
            icon={Icons.mail}
            inputMode="email"
            autoComplete="email"
            spellCheck={false}
            placeholder="you@example.com"
            autoFocus
          />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <form.SubmitButton className="w-full" size="lg">
                {isSubmitting ? "Sending…" : "Send reset link"}
              </form.SubmitButton>
            )}
          </form.Subscribe>
        </form.Form>
      </form.AppForm>
      <Link
        href="/auth/sign-in"
        className="text-muted-foreground text-sm underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
