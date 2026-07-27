"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { Icons } from "@/components/icons";

const PLATFORM_ROLES = new Set(["admin", "support"]);

// Client-side only — a UX convenience (don't show the page/nav flash to someone who'll
// just get 403s from every real action), not the actual security boundary. That's each
// route's own server-side check (Better Auth's admin plugin for /dashboard/users,
// requirePlatformPermission for /dashboard/organizations), already enforced regardless
// of whether this gate exists at all. See AGENTS.md's Platform admin section on the
// admin/support role split. Shared by both platform-admin pages rather than duplicated
// per feature — same check, same two roles, same fallback.
export function PlatformAccessGate({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const role = session?.user?.role;
  const authorized = !!role && PLATFORM_ROLES.has(role);

  useEffect(() => {
    if (!isPending && session && !authorized) {
      router.replace("/dashboard/overview");
    }
  }, [isPending, session, authorized, router]);

  if (isPending) {
    return null;
  }

  if (!authorized) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-2 text-center">
        <Icons.lock className="text-muted-foreground h-8 w-8" />
        <h2 className="text-lg font-medium">Platform access required</h2>
        <p className="text-muted-foreground text-sm">
          This page is for platform admins and support staff only.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
