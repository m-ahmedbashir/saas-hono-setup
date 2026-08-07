"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppForm } from "@/components/ui/tanstack-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { signUpSchema, type SignUpValues } from "../schemas/sign-up.schema";

// Better Auth's emailAndPassword config has no `autoSignIn: false` override (see
// packages/core/src/auth/index.ts), so its default (true) applies — a successful signUp
// call already establishes a real session, no separate sign-in step needed afterward.
export function SignUpView() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { name: "", email: "", password: "" } as SignUpValues,
    validators: { onSubmit: signUpSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      const { error } = await authClient.signUp.email(value);
      if (error) {
        setFormError(error.message ?? "Sign up failed");
        return;
      }
      router.push("/profile");
    },
  });

  return (
    <form.AppForm>
      <form.Form className="gap-4 p-2 md:p-0" id="sign-up-form">
        {formError && (
          <Alert variant="destructive">
            <Icons.alertCircle className="size-4" />
            <AlertTitle>Sign up failed</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}
        <form.TextField
          name="name"
          label="Name"
          icon={Icons.user}
          autoComplete="name"
          placeholder="Your name"
          autoFocus
        />
        <form.TextField
          name="email"
          label="Email"
          type="email"
          icon={Icons.mail}
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          placeholder="you@example.com"
        />
        <form.TextField
          name="password"
          label="Password"
          type="password"
          placeholder="At least 8 characters"
          icon={Icons.lock}
          autoComplete="new-password"
        />
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <form.SubmitButton className="mt-1 w-full" size="lg">
              {isSubmitting ? "Creating account…" : "Create account"}
            </form.SubmitButton>
          )}
        </form.Subscribe>
      </form.Form>
    </form.AppForm>
  );
}
