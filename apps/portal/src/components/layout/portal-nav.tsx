"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/icons";
import { cn } from "@repo/shared/utils";
import { authClient, useSession } from "@/lib/auth-client";

// Deliberately a flat top nav, not apps/admin's sidebar — this app has three pages, not
// a staff back office (see specs/customer-portal-plan.md's Architecture section: "no
// admin-style staff sidebar"). Billing/Team links are added once those pages exist
// (this file's own next incremental step), not stubbed as dead links ahead of them.
const NAV_LINKS = [{ href: "/profile", label: "Profile" }];

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

export function PortalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user;

  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-6">
          <Link href="/profile" className="flex items-center gap-2 font-medium">
            <Icons.logo className="text-primary size-5" />
            <span className="hidden sm:inline">Account</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "focus-visible:ring-ring rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  pathname === link.href
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  className="focus-visible:ring-ring h-9 gap-2 px-2 focus-visible:ring-2 focus-visible:ring-offset-2"
                />
              }
            >
              <Avatar className="size-7">
                <AvatarImage src={user.image ?? undefined} alt={user.name} />
                <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
              </Avatar>
              <Icons.chevronDown className="text-muted-foreground size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="text-muted-foreground truncate text-xs font-normal">{user.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => router.push("/profile")}>
                <Icons.profile className="mr-2 size-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut();
                  router.push("/auth/sign-in");
                }}
              >
                <Icons.logout className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
