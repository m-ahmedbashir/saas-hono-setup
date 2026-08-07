import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { SignUpView } from "@/features/auth/components/sign-up-view";
import { Icons } from "@/components/icons";
import { cn } from "@repo/shared/utils";

// Mirrors app/auth/sign-in/page.tsx's editorial split-panel layout exactly — same
// visual language across the two entry points to this app, see that file's own comments
// for the reasoning behind each piece.
const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["300", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your account",
};

const GRAIN_BACKGROUND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function SignUpPage() {
  return (
    <div className={cn("grid min-h-screen w-full lg:grid-cols-[1.1fr_1fr]", displayFont.variable)}>
      <div className="relative hidden overflow-hidden bg-black lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.14] mix-blend-overlay"
          style={{ backgroundImage: GRAIN_BACKGROUND }}
        />
        <div
          aria-hidden
          className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-white/[0.03] blur-3xl"
        />
        <div className="animate-fade-in-up relative z-10 [animation-delay:0ms]">
          <div className="flex items-center gap-2 text-sm font-medium tracking-wide text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
            saas-hono-setup
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <p className="animate-fade-in-up text-5xl leading-[1.05] font-light text-white italic [animation-delay:80ms] [font-family:var(--font-display)]">
            One account,
            <br />
            every plan.
          </p>
          <p className="animate-fade-in-up max-w-sm text-sm text-white/50 [animation-delay:160ms]">
            Manage your profile, billing, and team from one place — whether you're on your own or
            part of an organization.
          </p>
        </div>

        <div className="animate-fade-in-up relative z-10 flex items-center gap-8 text-xs text-white/40 [animation-delay:240ms]">
          <span>Multi-tenant</span>
          <span className="h-px w-8 bg-white/20" />
          <span>Permission-based</span>
          <span className="h-px w-8 bg-white/20" />
          <span>Audited</span>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="animate-fade-in-up text-muted-foreground mb-2 flex items-center gap-2 text-sm font-medium tracking-wide lg:hidden [animation-delay:0ms]">
            <span className="bg-foreground/60 h-1.5 w-1.5 rounded-full" />
            saas-hono-setup
          </div>
          <div className="animate-fade-in-up space-y-6 [animation-delay:40ms]">
            <div className="bg-primary/10 flex h-10 w-10 items-center justify-center rounded-lg">
              <Icons.logo className="text-primary h-5 w-5" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-3xl font-light tracking-tight [font-family:var(--font-display)]">
                Create your account
              </h1>
              <p className="text-muted-foreground text-sm">Get started in less than a minute</p>
            </div>
          </div>
          <div className="animate-fade-in-up [animation-delay:120ms]">
            <SignUpView />
          </div>
          <p className="animate-fade-in-up text-muted-foreground text-center text-sm [animation-delay:200ms]">
            Already have an account?{" "}
            <Link href="/auth/sign-in" className="hover:text-primary underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
