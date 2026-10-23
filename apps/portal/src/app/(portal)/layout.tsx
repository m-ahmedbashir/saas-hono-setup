import type { Metadata } from "next";
import { PortalNav } from "@/components/layout/portal-nav";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PortalNav />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
