"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { authClient, useSession } from "@/lib/auth-client";
import { AuthCard } from "./auth-card";

const SIGN_IN_TO_RESEND = `/auth/sign-in?redirect=${encodeURIComponent("/profile")}`;

/**
 * Where the emailed verification link lands. Better Auth's `GET /verify-email` redirects
 * here, adding `?error=<code>` on failure (1.7.12 `email-verification.mjs`'s
 * redirectOnError): TOKEN_EXPIRED, INVALID_TOKEN, INVALID_USER or USER_NOT_FOUND.
 */
export function EmailVerifiedView({ error }: { error?: string } = {}) {
  if (!error) {
    return (
      <AuthCard title="Email verified" description="Thanks — your email address is confirmed.">
        <Link href="/profile" className={buttonVariants({ className: "w-full" })}>
          Continue
        </Link>
      </AuthCard>
    );
  }
  if (error === "INVALID_USER") {
    return (
      <AuthCard
        title="Email not verified"
        description="This link is for a different account than the one you're signed in to. Sign out, then open the link again."
      >
        <Link href="/profile" className="text-sm underline underline-offset-4">
          Go to your profile
        </Link>
      </AuthCard>
    );
  }
  if (error === "TOKEN_EXPIRED" || error === "INVALID_TOKEN") {
    return (
      <AuthCard
        title="Email not verified"
        description="This verification link has expired or was already used."
      >
        <SendNewLink />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Email not verified"
      description="We couldn't verify your email with this link."
    >
      <SendNewLink />
    </AuthCard>
  );
}

function SendNewLink() {
  const { data: session } = useSession();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "limited" | "failed">("idle");
  const email = session?.user.email;

  // Resending needs to know the account; a signed-out visitor gets it via sign-in, where
  // the profile's verify notice offers the same resend.
  if (!email) {
    return (
      <Link href={SIGN_IN_TO_RESEND} className={buttonVariants({ className: "w-full" })}>
        Sign in to get a new link
      </Link>
    );
  }
  if (state === "sent") {
    return <p className="text-sm">We&apos;ve sent a new link to {email}.</p>;
  }

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({ email: email! });
    setState(!error ? "sent" : error.status === 429 ? "limited" : "failed");
  }

  return (
    <div className="space-y-3">
      <Button className="w-full" onClick={resend} disabled={state === "sending"}>
        {state === "sending" ? "Sending…" : "Send a new link"}
      </Button>
      {state === "limited" && (
        <p className="text-muted-foreground text-sm">Too many attempts. Wait a minute first.</p>
      )}
      {state === "failed" && (
        <p className="text-destructive text-sm">Couldn&apos;t send a new link. Try again.</p>
      )}
    </div>
  );
}
