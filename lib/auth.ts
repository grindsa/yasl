import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findGroupByToken, loadGroups, type GroupConfig } from "./groups-config";

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-yasl_session"
    : "yasl_session";

/** Sliding session lifetime: expires after this long without use. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days
/** Re-issue the cookie at most this often (avoids a Set-Cookie on every poll). */
export const SESSION_RENEW_AFTER_SECONDS = 60 * 60 * 24; // 1 day

export type AuthStatus = "anonymous" | "authenticated" | "invalid";

function getAuthSecret(): string | undefined {
  return process.env.AUTH_SECRET?.trim() || undefined;
}

function requireAuthSecret(): string {
  const secret = getAuthSecret();
  if (!secret) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return secret;
}

/** Changing SESSION_EPOCH invalidates every session without rotating AUTH_SECRET. */
function getSessionEpoch(): string {
  return process.env.SESSION_EPOCH?.trim() || "0";
}

/** True when the server can issue sessions at all. */
export function isAuthConfigured(): boolean {
  return Boolean(getAuthSecret()) && loadGroups().length > 0;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer | null {
  try {
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad =
      padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    return Buffer.from(padded + pad, "base64");
  } catch {
    return null;
  }
}

/**
 * Opaque id of the token that unlocked a session. Keyed with AUTH_SECRET so
 * the cookie reveals nothing that could be brute-forced offline.
 */
function tokenKid(token: string, secret: string): string {
  return b64url(
    createHmac("sha256", secret).update(`kid:${token}`, "utf8").digest(),
  ).slice(0, 16);
}

function signPayload(payload: string, secret: string): string {
  return b64url(
    createHmac("sha256", secret)
      .update(`${payload}.${getSessionEpoch()}`, "utf8")
      .digest(),
  );
}

/** Signed cookie value `iat.exp.kid.sig`; never contains the token itself. */
function buildSessionValue(kid: string, secret: string, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000);
  const exp = iat + SESSION_TTL_SECONDS;
  const payload = `${iat}.${exp}.${kid}`;
  return `${payload}.${signPayload(payload, secret)}`;
}

export function matchGroupToken(token: string): GroupConfig | undefined {
  return findGroupByToken(token);
}

export function createSessionValue(token: string, nowMs = Date.now()): string {
  const secret = requireAuthSecret();
  return buildSessionValue(tokenKid(token, secret), secret, nowMs);
}

export type SessionVerifyResult =
  | { ok: true; iat: number; exp: number; kid: string; groupId: string }
  | {
      ok: false;
      reason:
        | "missing"
        | "malformed"
        | "bad_sig"
        | "expired"
        | "revoked"
        | "no_secret";
    };

function groupForKid(
  kid: string,
  secret: string,
): GroupConfig | undefined {
  for (const group of loadGroups()) {
    if (tokenKid(group.token, secret) === kid) return group;
  }
  return undefined;
}

export function verifySessionValue(
  value: string | undefined | null,
): SessionVerifyResult {
  if (!value) return { ok: false, reason: "missing" };

  const secret = getAuthSecret();
  if (!secret) return { ok: false, reason: "no_secret" };

  const parts = value.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };

  const [iatStr, expStr, kid, sig] = parts;
  const iat = Number(iatStr);
  const exp = Number(expStr);
  if (!Number.isFinite(iat) || !Number.isFinite(exp) || !kid || !sig) {
    return { ok: false, reason: "malformed" };
  }

  const payload = `${iatStr}.${expStr}.${kid}`;
  const expected = signPayload(payload, secret);
  const sigBuf = fromB64url(sig);
  const expBuf = fromB64url(expected);
  if (!sigBuf || !expBuf || sigBuf.length !== expBuf.length) {
    return { ok: false, reason: "bad_sig" };
  }
  if (!timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "bad_sig" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (now > exp) return { ok: false, reason: "expired" };

  const group = groupForKid(kid, secret);
  if (!group) return { ok: false, reason: "revoked" };

  return { ok: true, iat, exp, kid, groupId: group.id };
}

/** Fresh cookie value when a valid session is due for sliding renewal. */
export function renewSessionValue(
  session: Extract<SessionVerifyResult, { ok: true }>,
  nowMs = Date.now(),
): string | undefined {
  const age = Math.floor(nowMs / 1000) - session.iat;
  if (age < SESSION_RENEW_AFTER_SECONDS) return undefined;
  return buildSessionValue(session.kid, requireAuthSecret(), nowMs);
}

export function sessionCookieOptions(maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** Read session from the request cookie store (Server Components / Route Handlers). */
export async function getAuthStatus(): Promise<AuthStatus> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return "anonymous";
  const result = verifySessionValue(raw);
  if (result.ok) return "authenticated";
  return "invalid";
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAuthStatus()) === "authenticated";
}

export async function getSessionGroup(): Promise<{
  groupId: string;
  groupName: string;
} | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  const result = verifySessionValue(raw);
  if (!result.ok) return null;
  const group = loadGroups().find((g) => g.id === result.groupId);
  if (!group) return null;
  return { groupId: group.id, groupName: group.name };
}
