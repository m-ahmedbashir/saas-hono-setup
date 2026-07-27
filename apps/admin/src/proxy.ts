import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const SIGN_IN_PATH = "/auth/sign-in";
const AUTHENTICATED_HOME_PATH = "/dashboard/overview";

// Presence-only check (Better Auth's documented Next.js middleware pattern) — fast and
// edge-safe, not full session validation. There's no DB round trip possible here, so a
// stale or forged cookie value passes this check; apps/api independently re-validates
// the real session on every authenticated request it actually serves. This middleware
// only decides where to route the browser, it is not the security boundary.
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSessionCookie = !!getSessionCookie(request);

  if (pathname.startsWith("/dashboard") && !hasSessionCookie) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
  }
  if (pathname.startsWith("/auth") && hasSessionCookie) {
    return NextResponse.redirect(new URL(AUTHENTICATED_HOME_PATH, request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
