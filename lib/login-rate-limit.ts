/**
 * In-memory limiter for failed logins (single container, resets on restart).
 * Per-IP only — no global lockout (that would let an attacker pause all logins).
 */

const PER_IP_MAX_FAILURES = 5;
const PER_IP_WINDOW_MS = 15 * 60_000;
/** Log when failures across all IPs spike; does not block logins. */
const GLOBAL_WARN_FAILURES = 200;
const GLOBAL_WARN_WINDOW_MS = 60 * 60_000;
const MAX_TRACKED_IPS = 10_000;

type Window = { failures: number; resetAt: number };

const perIp = new Map<string, Window>();
let global: Window = { failures: 0, resetAt: 0 };

function current(window: Window | undefined, now: number): Window | undefined {
  return window && window.resetAt > now ? window : undefined;
}

function sweep(now: number): void {
  for (const [ip, window] of perIp) {
    if (window.resetAt <= now) perIp.delete(ip);
  }
}

/**
 * Client IP for rate limiting. Prefer the last X-Forwarded-For hop (appended by
 * a correctly configured reverse proxy). Fall back to X-Real-IP only when the
 * proxy overwrites it (Caddy `header_up X-Real-IP {remote_host}`, nginx
 * `$remote_addr`). Never prefer a client-supplied X-Real-IP over XFF.
 */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  if (last) return last;
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function loginRetryAfterSeconds(ip: string, now = Date.now()): number {
  const ipWindow = current(perIp.get(ip), now);
  if (ipWindow && ipWindow.failures >= PER_IP_MAX_FAILURES) {
    return Math.ceil((ipWindow.resetAt - now) / 1000);
  }
  return 0;
}

export function recordLoginFailure(ip: string, now = Date.now()): void {
  if (!current(global, now)) {
    global = { failures: 0, resetAt: now + GLOBAL_WARN_WINDOW_MS };
  }
  global.failures += 1;
  if (global.failures === GLOBAL_WARN_FAILURES) {
    console.warn(
      `[auth] ${GLOBAL_WARN_FAILURES} failed logins within an hour (alerting only; logins still allowed)`,
    );
  }

  if (perIp.size >= MAX_TRACKED_IPS) sweep(now);
  const window = current(perIp.get(ip), now) ?? {
    failures: 0,
    resetAt: now + PER_IP_WINDOW_MS,
  };
  window.failures += 1;
  perIp.set(ip, window);
}

export function recordLoginSuccess(ip: string): void {
  perIp.delete(ip);
}
