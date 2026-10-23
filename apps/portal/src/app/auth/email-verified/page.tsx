import type { Metadata } from "next";
import { EmailVerifiedView } from "@/features/auth/components/email-verified-view";

export const metadata: Metadata = {
  title: "Email verification",
};

// Reachable signed in or out — verifying signs the user in, and a failed link can be opened
// from any browser. proxy.ts lets /auth/email-verified through for that reason.
export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <EmailVerifiedView error={typeof error === "string" ? error : undefined} />
    </main>
  );
}
