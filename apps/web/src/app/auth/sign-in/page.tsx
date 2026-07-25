import type { Metadata } from "next";
import Link from "next/link";
import { SignInView } from "@/features/auth/components/sign-in-view";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your account",
};

export default function SignInPage() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center gap-6 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">Enter your email and password to continue</p>
        </div>
        <SignInView />
        <p className="text-muted-foreground text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/auth/sign-up" className="hover:text-primary underline underline-offset-4">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}
