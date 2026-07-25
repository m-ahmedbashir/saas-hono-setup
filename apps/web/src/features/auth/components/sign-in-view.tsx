"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAppForm } from "@/components/ui/tanstack-form";
import { authClient } from "@/lib/auth-client";
import { signInSchema, type SignInValues } from "../schemas/sign-in.schema";

export function SignInView() {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: "", password: "" } as SignInValues,
    validators: { onSubmit: signInSchema },
    onSubmit: async ({ value }) => {
      setFormError(null);
      // authClient.signIn.email never throws for expected auth failures — it resolves
      // { data, error }, same contract as every other Better Auth client call.
      const { error } = await authClient.signIn.email({
        email: value.email,
        password: value.password,
      });
      if (error) {
        setFormError(error.message ?? "Sign in failed");
        return;
      }
      router.push("/dashboard/overview");
    },
  });

  return (
    <form.AppForm>
      <form.Form>
        {formError && (
          <div
            role="alert"
            className="bg-destructive/10 text-destructive rounded-md border p-3 text-sm"
          >
            {formError}
          </div>
        )}
        <form.TextField name="email" label="Email" type="email" required autoComplete="email" />
        <form.TextField
          name="password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
        />
        <form.SubmitButton>Sign in</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
