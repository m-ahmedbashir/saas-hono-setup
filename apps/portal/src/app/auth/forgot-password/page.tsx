import type { Metadata } from "next";
import { ForgotPasswordView } from "@/features/auth/components/forgot-password-view";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <ForgotPasswordView />
    </main>
  );
}
