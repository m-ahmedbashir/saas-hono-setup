import type { Metadata } from "next";
import { ResetPasswordView } from "@/features/auth/components/reset-password-view";

export const metadata: Metadata = {
  title: "Reset password",
};

// Reachable signed in or out — proxy.ts lets /auth/reset-password through, since the
// emailed token, not the browser's session, decides whose password changes.
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <ResetPasswordView token={typeof token === "string" ? token : undefined} />
    </main>
  );
}
