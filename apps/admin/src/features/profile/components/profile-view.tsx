"use client";

import PageContainer from "@/components/layout/page-container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/auth-client";
import { UpdateNameForm } from "./update-name-form";
import { ChangePasswordForm } from "./change-password-form";

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"
  );
}

export function ProfileView() {
  const { data: session, isPending } = useSession();
  const user = session?.user;

  return (
    <PageContainer
      isLoading={isPending}
      pageTitle="Profile"
      pageDescription="Manage your account details and security."
    >
      <div className="flex w-full flex-col gap-6">
        {user && (
          <div className="bg-card flex min-w-0 items-center gap-4 rounded-xl border p-6">
            <Avatar className="size-16 shrink-0">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback className="text-lg">{initials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{user.name}</h2>
                {user.role && (
                  <Badge variant="outline" className="shrink-0 capitalize">
                    {user.role}
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground truncate text-sm">{user.email}</p>
            </div>
          </div>
        )}

        <div className="bg-card divide-border divide-y rounded-xl border">
          <UpdateNameForm currentName={user?.name ?? ""} />
          <ChangePasswordForm />
        </div>
      </div>
    </PageContainer>
  );
}
