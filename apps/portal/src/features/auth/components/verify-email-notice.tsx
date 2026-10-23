"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icons } from "@/components/icons";
import { authClient, useSession } from "@/lib/auth-client";

type ResendState = "idle" | "sending" | "sent" | "limited" | "failed";

/**
 * Shown to signed-in users whose email isn't verified yet. Verification is offered, not
 * required (requireEmailVerification is off), so this nudges rather than blocks. Dismissal
 * lasts for this page view only; the notice returns on the next full load until verified.
 */
export function VerifyEmailNotice() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(false);
  const [resend, setResend] = useState<ResendState>("idle");

  if (!session || session.user.emailVerified || dismissed) return null;
  const { email } = session.user;

  async function resendEmail() {
    setResend("sending");
    const { error } = await authClient.sendVerificationEmail({ email });
    if (!error) setResend("sent");
    else setResend(error.status === 429 ? "limited" : "failed");
  }

  return (
    <div className="px-4 pt-4 md:px-6">
      <Alert>
        <Icons.mail className="size-4" />
        <AlertTitle>Verify your email</AlertTitle>
        <AlertDescription>
          <p>
            We sent a link to {email}. Open it to confirm this address is yours.
            {resend === "sent" && " We've sent another link — check your inbox."}
            {resend === "limited" && " Too many attempts. Wait a minute, then try again."}
            {resend === "failed" && " We couldn't send another link. Try again."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={resendEmail}
              disabled={resend === "sending" || resend === "sent"}
            >
              {resend === "sending" ? "Sending…" : "Resend email"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Dismiss
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
