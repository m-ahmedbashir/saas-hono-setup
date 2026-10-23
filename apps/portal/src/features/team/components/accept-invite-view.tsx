"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icons } from "@/components/icons";
import { cn } from "@repo/shared/utils";
import { authClient, useSession } from "@/lib/auth-client";
import { AuthActionError } from "@/lib/auth-action";
import {
  acceptInvitation,
  describeTeamError,
  getInvitation,
  rejectInvitation,
} from "../api/service";
import { roleLabel } from "../lib/format";
import { acceptInvitePath } from "../lib/invite-link";

/**
 * Where an invitation link lands. Better Auth only reveals an invitation to a signed-in
 * user whose email matches it, so a signed-out visitor is sent through sign-in/sign-up
 * and back here (via the safe ?redirect= those pages accept) before anything is shown.
 * Accepting makes the organization the user's active one, then lands them on its team.
 */
export function AcceptInviteView({ invitationId }: { invitationId: string | undefined }) {
  const { data: session, isPending } = useSession();

  if (!invitationId) {
    return (
      <Notice
        icon={<Icons.alertCircle className="text-destructive size-10" />}
        title="This invitation link is incomplete"
        body="Ask the person who invited you to send the link again."
      />
    );
  }
  if (isPending) return <CardSkeleton />;
  if (!session) return <SignedOut invitationId={invitationId} />;
  return <InvitationDetails invitationId={invitationId} email={session.user.email} />;
}

function SignedOut({ invitationId }: { invitationId: string }) {
  const back = encodeURIComponent(acceptInvitePath(invitationId));
  return (
    <Notice
      icon={<Icons.mail className="text-muted-foreground size-10" />}
      title="You've been invited to join a team"
      body="Sign in, or create an account, using the email address the invitation was sent to."
    >
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href={`/auth/sign-in?redirect=${back}`} className={cn(buttonVariants(), focusRing)}>
          Sign in
        </Link>
        <Link
          href={`/auth/sign-up?redirect=${back}`}
          className={cn(buttonVariants({ variant: "outline" }), focusRing)}
        >
          Create account
        </Link>
      </div>
    </Notice>
  );
}

function InvitationDetails({ invitationId, email }: { invitationId: string; email: string }) {
  const router = useRouter();
  const invitation = useQuery({
    queryKey: ["invitation", invitationId],
    queryFn: () => getInvitation(invitationId),
    retry: false,
  });
  const accept = useMutation({
    mutationFn: () => acceptInvitation(invitationId),
    onSuccess: () => router.push("/team"),
  });
  const decline = useMutation({ mutationFn: () => rejectInvitation(invitationId) });

  if (invitation.isPending) return <CardSkeleton />;

  if (invitation.isError) {
    const wrongPerson =
      invitation.error instanceof AuthActionError &&
      invitation.error.code === "YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION";
    return wrongPerson ? (
      <Notice
        icon={<Icons.user className="text-muted-foreground size-10" />}
        title="This invitation is for someone else"
        body={`You're signed in as ${email}, but this invitation was sent to a different address. Sign out and sign in with the invited email to accept it.`}
      >
        <Button
          variant="outline"
          className={cn("mt-6", focusRing)}
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
        >
          Sign out
        </Button>
      </Notice>
    ) : (
      <Notice
        icon={<Icons.alertCircle className="text-destructive size-10" />}
        title="This invitation is no longer valid"
        body="It may have expired, been canceled, or already been used. Ask for a new invitation if you still need access."
      />
    );
  }

  if (decline.isSuccess) {
    return (
      <Notice
        icon={<Icons.check className="text-muted-foreground size-10" />}
        title="Invitation declined"
        body={`You won't be added to ${invitation.data.organizationName}.`}
      >
        <Link
          href="/profile"
          className={cn(buttonVariants({ variant: "outline" }), "mt-6", focusRing)}
        >
          Go to your account
        </Link>
      </Notice>
    );
  }

  const busy = accept.isPending || decline.isPending || accept.isSuccess;
  const error = accept.error ?? decline.error;

  return (
    <Notice
      icon={<Icons.teams className="text-primary size-10" />}
      title={`Join ${invitation.data.organizationName}`}
      body={`${invitation.data.inviterEmail} invited you to join as ${roleLabel(invitation.data.role).toLowerCase()}.`}
    >
      {error && (
        <Alert variant="destructive" className="mt-6 text-left">
          <Icons.alertCircle className="size-4" />
          <AlertDescription>{describeTeamError(error)}</AlertDescription>
        </Alert>
      )}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Button
          disabled={busy}
          onClick={() => accept.mutate()}
          className={cn(focusRing, "disabled:cursor-not-allowed disabled:opacity-50")}
        >
          {accept.isPending || accept.isSuccess ? "Joining…" : "Accept invitation"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => decline.mutate()}
          className={cn(focusRing, "disabled:cursor-not-allowed disabled:opacity-50")}
        >
          {decline.isPending ? "Declining…" : "Decline"}
        </Button>
      </div>
    </Notice>
  );
}

const focusRing = "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2";

function Notice({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-card w-full max-w-md rounded-xl border p-8 text-center">
      <div className="flex justify-center">{icon}</div>
      <h1 className="mt-4 text-lg font-semibold break-words">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm break-words">{body}</p>
      {children}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="bg-card w-full max-w-md space-y-3 rounded-xl border p-8" aria-busy="true">
      <Skeleton className="mx-auto size-10 rounded-full" />
      <Skeleton className="mx-auto h-5 w-48" />
      <Skeleton className="mx-auto h-4 w-64" />
    </div>
  );
}
