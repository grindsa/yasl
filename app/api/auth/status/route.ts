import { NextResponse } from "next/server";
import {
  getAuthStatus,
  getSessionGroup,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionValue,
} from "@/lib/auth";
import { cookies } from "next/headers";

export async function GET() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const verified = verifySessionValue(raw);
  const status = await getAuthStatus();
  const session = verified.ok ? await getSessionGroup() : null;

  const response = NextResponse.json({
    ok: true,
    status,
    groupId: session?.groupId ?? null,
    groupName: session?.groupName ?? null,
  });

  if (raw && !verified.ok) {
    response.cookies.set(SESSION_COOKIE, "", {
      ...sessionCookieOptions(0),
      maxAge: 0,
    });
  }

  return response;
}
