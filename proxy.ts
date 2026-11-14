import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  renewSessionValue,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  sessionCookieOptions,
  verifySessionValue,
} from "@/lib/auth";
import { isSameOriginRequest, isStateChangingMethod } from "@/lib/request-guard";

/**
 * Next.js 16: `middleware` was renamed to `proxy`.
 * Gates /api/* behind a signed session cookie. Auth endpoints stay public.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/api/") &&
    isStateChangingMethod(request.method) &&
    !isSameOriginRequest(request.headers)
  ) {
    return NextResponse.json({ error: "cross_origin" }, { status: 403 });
  }

  const isAuthApi =
    pathname === "/api/auth/login" ||
    pathname === "/api/auth/logout" ||
    pathname === "/api/auth/status";

  if (isAuthApi) {
    return NextResponse.next();
  }

  const raw = request.cookies.get(SESSION_COOKIE)?.value;
  const session = verifySessionValue(raw);

  const applySessionCookie = (response: NextResponse) => {
    if (raw && !session.ok) {
      response.cookies.set(SESSION_COOKIE, "", {
        ...sessionCookieOptions(0),
        maxAge: 0,
      });
    }
    if (session.ok) {
      const renewed = renewSessionValue(session);
      if (renewed) {
        response.cookies.set(
          SESSION_COOKIE,
          renewed,
          sessionCookieOptions(SESSION_TTL_SECONDS),
        );
      }
    }
    return response;
  };

  if (pathname.startsWith("/api/")) {
    if (!session.ok) {
      return applySessionCookie(
        NextResponse.json(
          { error: "unauthorized", status: "anonymous" },
          { status: 401 },
        ),
      );
    }
    return applySessionCookie(NextResponse.next());
  }

  return applySessionCookie(NextResponse.next());
}

export const config = {
  matcher: [
    "/api/:path*",
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
