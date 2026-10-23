"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icons } from "@/components/icons";
import { authClient } from "@/lib/auth-client";
import { useSwitchOrganization } from "@/hooks/use-switch-organization";

const PERSONAL_LABEL = "Personal account";

/**
 * Which account the portal is acting for: one of the user's organizations, or their
 * personal (individual) account. Billing and team follow this choice. Shown even to
 * users in no organization, since it's also where they start one.
 */
export function OrganizationSwitcher() {
  const router = useRouter();
  const { data: organizations } = authClient.useListOrganizations();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const switchTo = useSwitchOrganization();

  if (!organizations) return null;

  const activeId = activeOrganization?.id ?? null;
  const currentLabel = activeOrganization?.name ?? PERSONAL_LABEL;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={switchTo.isPending}
            aria-label={`Switch account (current: ${currentLabel})`}
            className="focus-visible:ring-ring max-w-48 gap-2 focus-visible:ring-2 focus-visible:ring-offset-2"
          />
        }
      >
        <span className="truncate">{currentLabel}</span>
        <Icons.chevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {organizations.length > 0 && (
          <>
            {/* Base UI requires a menu label inside a group — without it the menu throws on open. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                Organizations
              </DropdownMenuLabel>
              {organizations.map((org) => (
                <DropdownMenuItem key={org.id} onClick={() => switchTo.mutate(org.id)}>
                  <span className="min-w-0 flex-1 truncate">{org.name}</span>
                  {org.id === activeId && <Icons.check className="size-4" aria-label="Current" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={() => switchTo.mutate(null)}>
          <span className="min-w-0 flex-1 truncate">{PERSONAL_LABEL}</span>
          {activeId === null && <Icons.check className="size-4" aria-label="Current" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => router.push("/organization/new")}>
          <Icons.add className="mr-2 size-4" />
          Create organization
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
