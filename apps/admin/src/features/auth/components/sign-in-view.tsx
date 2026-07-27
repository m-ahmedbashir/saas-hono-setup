"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { signInSchema, type SignInValues } from "../schemas/sign-in.schema";

export function SignInView() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: "", password: "", rememberMe: true } as SignInValues,
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      // authClient.signIn.email never throws for expected auth failures — it resolves
      // { data, error }, same contract as every other Better Auth client call.
      const { error } = await authClient.signIn.email(value);
      if (error) {
        setFormError(error.message ?? "Sign in failed");
        return;
      }
      router.push("/dashboard/overview");
    },
  });

  return (
    <form.AppForm>
      <form.Form className="gap-4 p-2 md:p-0" id="sign-in-form">
        {formError && (
          <Alert variant="destructive">
            <Icons.alertCircle className="size-4" />
            <AlertTitle>Sign in failed</AlertTitle>
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
        <form.TextField
          name="password"
          label="Password"
          type="password"
          placeholder="••••••••"
          icon={Icons.lock}
          autoComplete="current-password"
          labelSuffix={
            <Link
              href="/auth/forgot-password"
              className="text-muted-foreground hover:text-primary text-sm underline underline-offset-4"
            >
              Forgot password?
            </Link>
          }
        />
        <form.CheckboxField name="rememberMe" label="Remember me" />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <form.SubmitButton className="mt-1 w-full" size="lg">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.Form>
    </form.AppForm>
  );
}
