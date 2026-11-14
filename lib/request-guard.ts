import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isStateChangingMethod(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function isSameOriginRequest(headers: Headers): boolean {
  const fetchSite = headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";

  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Content-Type muss application/json sein" },
        { status: 415 },
      ),
    };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Ungültiger JSON-Body" },
        { status: 400 },
      ),
    };
  }
}
