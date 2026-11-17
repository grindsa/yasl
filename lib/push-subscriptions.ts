import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { groupDataDir } from "./data-paths";

export type PushSubscriptionRecord = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  createdAt: string;
  userAgent?: string;
};

type SubscriptionsFile = {
  subscriptions?: PushSubscriptionRecord[];
};

const locks = new Map<string, Promise<unknown>>();

function subscriptionsPath(groupId: string): string {
  return join(groupDataDir(groupId), "push-subscriptions.yml");
}

async function withLock<T>(groupId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(groupId) ?? Promise.resolve();
  let release!: () => void;
  const done = new Promise<void>((r) => {
    release = r;
  });
  locks.set(
    groupId,
    prev.then(() => done),
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function readSubscriptions(
  groupId: string,
): Promise<PushSubscriptionRecord[]> {
  const path = subscriptionsPath(groupId);
  if (!existsSync(/*turbopackIgnore: true*/ path)) return [];
  try {
    const text = await readFile(path, "utf8");
    const parsed = parseYaml(text) as SubscriptionsFile;
    const list = Array.isArray(parsed?.subscriptions)
      ? parsed.subscriptions
      : [];
    return list.filter(
      (s): s is PushSubscriptionRecord =>
        !!s &&
        typeof s.endpoint === "string" &&
        !!s.keys &&
        typeof s.keys.p256dh === "string" &&
        typeof s.keys.auth === "string",
    );
  } catch {
    return [];
  }
}

async function writeSubscriptions(
  groupId: string,
  subscriptions: PushSubscriptionRecord[],
): Promise<void> {
  const dir = groupDataDir(groupId);
  await mkdir(dir, { recursive: true });
  const path = subscriptionsPath(groupId);
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  const text = stringifyYaml(
    { subscriptions },
    { lineWidth: 0, defaultStringType: "QUOTE_DOUBLE" },
  );
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
}

export async function listPushSubscriptions(
  groupId: string,
): Promise<PushSubscriptionRecord[]> {
  return withLock(groupId, () => readSubscriptions(groupId));
}

export async function upsertPushSubscription(
  groupId: string,
  input: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    userAgent?: string;
  },
): Promise<void> {
  const endpoint = input.endpoint.trim();
  const p256dh = input.keys.p256dh.trim();
  const auth = input.keys.auth.trim();
  if (!endpoint || !p256dh || !auth) {
    throw new Error("invalid_subscription");
  }

  return withLock(groupId, async () => {
    const current = await readSubscriptions(groupId);
    const now = new Date().toISOString();
    const next = current.filter((s) => s.endpoint !== endpoint);
    next.push({
      endpoint,
      keys: { p256dh, auth },
      createdAt: now,
      ...(input.userAgent ? { userAgent: input.userAgent.slice(0, 200) } : {}),
    });
    await writeSubscriptions(groupId, next);
  });
}

export async function removePushSubscription(
  groupId: string,
  endpoint: string,
): Promise<boolean> {
  const trimmed = endpoint.trim();
  if (!trimmed) return false;
  return withLock(groupId, async () => {
    const current = await readSubscriptions(groupId);
    const next = current.filter((s) => s.endpoint !== trimmed);
    if (next.length === current.length) return false;
    await writeSubscriptions(groupId, next);
    return true;
  });
}

export function isValidPushSubscriptionBody(
  body: unknown,
): body is {
  endpoint: string;
  keys: { p256dh: string; auth: string };
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const obj = body as Record<string, unknown>;
  if (typeof obj.endpoint !== "string" || !obj.endpoint.trim()) return false;
  const keys = obj.keys;
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return false;
  const k = keys as Record<string, unknown>;
  return (
    typeof k.p256dh === "string" &&
    !!k.p256dh.trim() &&
    typeof k.auth === "string" &&
    !!k.auth.trim()
  );
}
