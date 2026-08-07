import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces } from "next/font/google";
import { SignInView } from "@/features/auth/components/sign-in-view";
import { Icons } from "@/components/icons";
import { cn } from "@repo/shared/utils";

// Scoped to this route only — the display serif gives the login screen its own
// editorial voice without touching the dashboard's Geist-based type system
// (font.config.ts). Deliberately not Inter/Roboto/system-ui: a high-contrast serif
// reads as considered, not templated.
const displayFont = Fraunces({
  subsets: ["latin"],
  weight: ["300", "500"],
  style: ["normal", "italic"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to your account",
};

// Shared grain texture — used on the always-dark left panel above `lg`, and again as
// the base layer for the whole page below `lg` (where the left panel is hidden), so
// the small-viewport experience isn't just a flat, textureless black rectangle.
const GRAIN_BACKGROUND =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export default function SignInPage() {
  return (
    <div className={cn("grid min-h-screen w-full lg:grid-cols-[1.1fr_1fr]", displayFont.variable)}>
      {/* Left: editorial panel — hidden below lg, this app's "personality" lives here so the
          form itself can stay plain, legible, and trustworthy. Deliberately always dark
          regardless of the site's own light/dark theme (every child here is hardcoded
          white-on-black, not theme tokens) — same reasoning a permanently-dark decorative
          panel would have on any site. The form panel to the right must NOT copy this: it
          uses theme tokens throughout, so it has to sit on the theme's actual background. */}
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
            Every session,
            <br />
            accounted for.
          </p>
          <p className="animate-fade-in-up max-w-sm text-sm text-white/50 [animation-delay:160ms]">
            Individuals, organizations, and everything in between — one identity layer, verified on
            every request.
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

      {/* Right (the only panel visible below lg): the form panel. Sits on the theme's own
          background/foreground tokens throughout — must work in both light and dark mode,
          since `next-themes` makes that a real user choice here, not just the left panel's
          fixed dark aesthetic. The mobile identity row below stands in for the editorial
          copy that's hidden at this width, using muted-foreground, not hardcoded white. */}
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
                Sign in
              </h1>
              <p className="text-muted-foreground text-sm">
                Enter your email and password to continue
              </p>
            </div>
          </div>
          <div className="animate-fade-in-up [animation-delay:120ms]">
            <SignInView />
          </div>
          <p className="animate-fade-in-up text-muted-foreground text-center text-sm [animation-delay:200ms]">
            Don&apos;t have an account?{" "}
            <Link href="/auth/sign-up" className="hover:text-primary underline underline-offset-4">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
