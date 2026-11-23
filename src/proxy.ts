import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session-token";

/**
 * Gate every route behind the owner session. Public: login + auth endpoints, PWA assets,
 * token-authenticated endpoints (iOS Shortcuts, cron). The DAL re-checks the session generation.
 */
const PUBLIC = [/^\/login$/, /^\/api\/auth\//, /^\/api\/shortcuts\//, /^\/api\/cron\//, /^\/manifest\.webmanifest$/, /^\/sw\.js$/, /^\/offline$/];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // One canonical host in production: passkeys are bound to it (RP ID).
  const canonical = process.env.APP_ORIGIN ? new URL(process.env.APP_ORIGIN).host : null;
  const host = req.headers.get("host");
  if (process.env.VERCEL_ENV === "production" && canonical && host && host !== canonical && !pathname.startsWith("/api/")) {
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, process.env.APP_ORIGIN), 308);
  }
  if (PUBLIC.some((r) => r.test(pathname))) return NextResponse.next();
  const ok = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icons/|favicon.ico|apple-touch-icon.png|robots.txt|barcode/).*)"],
};
