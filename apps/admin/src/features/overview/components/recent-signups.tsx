import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import type { RecentSignup } from "../api/stats";

interface RecentSignupsProps {
  signups: RecentSignup[];
}

export function RecentSignups({ signups }: RecentSignupsProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Recent Signups</CardTitle>
        <CardDescription>
          The latest organizations and individuals to join the platform.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {signups.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing to show yet.</p>
        ) : (
          <div className="space-y-6">
            {signups.map((signup) => (
              <Link
                key={`${signup.type}-${signup.id}`}
                href={signup.href}
                className="focus-visible:ring-ring flex items-center gap-2 rounded focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>
                    {signup.type === "organization" ? (
                      <Icons.workspace className="size-4" />
                    ) : (
                      <Icons.user className="size-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
                <div className="ml-1 min-w-0 flex-1 space-y-1">
                  <p className="truncate text-sm leading-none font-medium hover:underline">
                    {signup.name}
                  </p>
                  <p className="text-muted-foreground truncate text-sm">{signup.email ?? "—"}</p>
                </div>
                <Badge variant="outline" className="shrink-0 capitalize">
                  {signup.type}
                </Badge>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
