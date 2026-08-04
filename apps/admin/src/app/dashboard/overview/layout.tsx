import Link from "next/link";
import { cookies } from "next/headers";
import PageContainer from "@/components/layout/page-container";
import { PlatformAccessGate } from "@/components/platform-access-gate";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Icons } from "@/components/icons";
import { getOverviewStats } from "@/features/overview/api/stats";
import React from "react";

// Real counts (see features/overview/api/stats.ts), one card per nav item — Staff,
// Organizations, Individuals, Subscription Plans. Skipped: fake trend arrows
// (+12.5% style) — no historical/time-series data exists yet to compute a real
// period-over-period change from, and a made-up percentage would be worse than none.
export default async function OverViewLayout({
  sales,
  pie_stats,
  bar_stats,
  area_stats,
}: {
  sales: React.ReactNode;
  pie_stats: React.ReactNode;
  bar_stats: React.ReactNode;
  area_stats: React.ReactNode;
}) {
  // Same cookie-forwarding reasoning as every other server-side fetch in this app. The
  // PlatformAccessGate below is client-side only (same "UX convenience, not the
  // security boundary" caveat its own file documents) — Next.js still resolves this
  // layout's parallel-route slots and this data fetch server-side regardless of what
  // the gate decides to render, so a non-staff session's 403 from these staff-only
  // endpoints is caught here too, not just hidden behind the gate.
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  const stats = cookieHeader
    ? await getOverviewStats({ Cookie: cookieHeader }).catch(() => null)
    : null;

  const cards = [
    {
      title: "Staff",
      value: stats?.staffTotal,
      href: "/dashboard/staff",
      icon: Icons.teams,
      description: "Admin + support accounts",
    },
    {
      title: "Organizations",
      value: stats?.organizationsTotal,
      href: "/dashboard/organizations",
      icon: Icons.workspace,
      description: "Registered on the platform",
    },
    {
      title: "Individuals",
      value: stats?.individualsTotal,
      href: "/dashboard/individuals",
      icon: Icons.user,
      description: "Every non-staff account",
    },
    {
      title: "Active Plans",
      value: stats?.activePlansTotal,
      href: "/dashboard/subscription-plans",
      icon: Icons.billing,
      description: "Available for new checkouts",
    },
  ];

  return (
    <PageContainer>
      <PlatformAccessGate>
        <div className="flex flex-1 flex-col space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Hi, Welcome back 👋</h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Link
                key={card.title}
                href={card.href}
                className="focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                <Card className="@container/card hover:border-primary/50 h-full transition-colors">
                  <CardHeader>
                    <CardDescription className="flex items-center gap-1.5">
                      <card.icon className="size-4" />
                      {card.title}
                    </CardDescription>
                    <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                      {card.value ?? "—"}
                    </CardTitle>
                  </CardHeader>
                  <CardFooter className="text-muted-foreground text-sm">
                    {card.description}
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-7">
            <div className="col-span-4">{bar_stats}</div>
            <div className="col-span-4 md:col-span-3">
              {/* sales arallel routes */}
              {sales}
            </div>
            <div className="col-span-4">{area_stats}</div>
            <div className="col-span-4 min-h-0 md:col-span-3">{pie_stats}</div>
          </div>
        </div>
      </PlatformAccessGate>
    </PageContainer>
  );
}
