import type { Metadata } from "next";
import { PortalNav } from "@/components/layout/portal-nav";
import { VerifyEmailNotice } from "@/features/auth/components/verify-email-notice";

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
      <VerifyEmailNotice />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
