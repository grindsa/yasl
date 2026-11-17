import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";

export const MAX_GROUPS = 5;
export const MIN_ACCESS_TOKEN_LENGTH = 24;
export const DEFAULT_NOTIFY_DEBOUNCE_SECONDS = 120;
export const MIN_NOTIFY_DEBOUNCE_SECONDS = 10;
export const MAX_NOTIFY_DEBOUNCE_SECONDS = 3600;

export type GroupNotificationsConfig = {
  enabled: boolean;
  /** Quiet period after the last list change before a push is sent. */
  debounceSeconds: number;
};

export type GroupConfig = {
  id: string;
  name: string;
  token: string;
  notifications: GroupNotificationsConfig;
};

type RawGroupsFile = {
  groups?: Array<{
    id?: unknown;
    name?: unknown;
    token?: unknown;
    notifications?: unknown;
  }>;
};

function configPath(): string {
  const override = process.env.GROUPS_CONFIG_FILE?.trim();
  if (override) return resolve(override);
  return join(process.cwd(), "config", "groups.yml");
}

function hashToken(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/** Constant-time compare for variable-length secrets. */
export function safeEqualString(a: string, b: string): boolean {
  return timingSafeEqual(hashToken(a), hashToken(b));
}

function parseNotifications(raw: unknown): GroupNotificationsConfig {
  const defaults: GroupNotificationsConfig = {
    enabled: false,
    debounceSeconds: DEFAULT_NOTIFY_DEBOUNCE_SECONDS,
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return defaults;
  }
  const obj = raw as Record<string, unknown>;
  const enabled =
    obj.enabled === true ||
    obj.enabled === 1 ||
    (typeof obj.enabled === "string" &&
      ["1", "true", "yes"].includes(obj.enabled.trim().toLowerCase()));

  let debounceSeconds = DEFAULT_NOTIFY_DEBOUNCE_SECONDS;
  const rawDebounce = obj.debounceSeconds ?? obj.debounce_seconds;
  if (typeof rawDebounce === "number" && Number.isFinite(rawDebounce)) {
    debounceSeconds = Math.round(rawDebounce);
  } else if (typeof rawDebounce === "string" && rawDebounce.trim()) {
    const n = Number.parseFloat(rawDebounce);
    if (Number.isFinite(n)) debounceSeconds = Math.round(n);
  }
  debounceSeconds = Math.min(
    MAX_NOTIFY_DEBOUNCE_SECONDS,
    Math.max(MIN_NOTIFY_DEBOUNCE_SECONDS, debounceSeconds),
  );

  return { enabled, debounceSeconds };
}

let cachedPath: string | undefined;
let cachedMtimeMs = -1;
let cachedGroups: GroupConfig[] = [];
let loggedConfigKey: string | undefined;

function logProblems(
  path: string,
  rawCount: number,
  shortTokens: number,
  invalid: number,
): void {
  const key = `${path}:${rawCount}:${shortTokens}:${invalid}`;
  if (loggedConfigKey === key) return;
  loggedConfigKey = key;
  if (shortTokens > 0) {
    console.error(
      `[groups] ignoring ${shortTokens} token(s) shorter than ${MIN_ACCESS_TOKEN_LENGTH} characters in ${path}`,
    );
  }
  if (invalid > 0) {
    console.error(
      `[groups] ignoring ${invalid} incomplete group entr(y/ies) in ${path}`,
    );
  }
  if (rawCount > MAX_GROUPS) {
    console.error(
      `[groups] ${path} has ${rawCount} groups; only the first ${MAX_GROUPS} are used`,
    );
  }
}

/**
 * Live groups from config/groups.yml. Tokens are secrets — file is gitignored.
 * Reloads when the file mtime changes.
 */
export function loadGroups(): GroupConfig[] {
  const path = configPath();
  if (!existsSync(/*turbopackIgnore: true*/ path)) {
    if (cachedPath !== path) {
      console.error(`[groups] missing ${path} — copy config/groups.example.yml`);
      cachedPath = path;
      cachedMtimeMs = -1;
    }
    cachedGroups = [];
    return [];
  }

  let mtimeMs = 0;
  try {
    mtimeMs = statSync(/*turbopackIgnore: true*/ path).mtimeMs;
  } catch {
    return [];
  }

  if (cachedPath === path && cachedMtimeMs === mtimeMs) {
    return cachedGroups;
  }

  let parsed: RawGroupsFile;
  try {
    const text = readFileSync(/*turbopackIgnore: true*/ path, "utf8");
    parsed = (parseYaml(text) as RawGroupsFile) ?? {};
  } catch (err) {
    console.error(`[groups] failed to read ${path}:`, err);
    return cachedGroups;
  }

  const raw = Array.isArray(parsed.groups) ? parsed.groups : [];
  let shortTokens = 0;
  let invalid = 0;
  const seenIds = new Set<string>();
  const groups: GroupConfig[] = [];

  for (const entry of raw) {
    const id = typeof entry?.id === "string" ? entry.id.trim() : "";
    const name = typeof entry?.name === "string" ? entry.name.trim() : "";
    const token = typeof entry?.token === "string" ? entry.token.trim() : "";
    if (!id || !name || !token) {
      invalid += 1;
      continue;
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,31}$/i.test(id)) {
      invalid += 1;
      continue;
    }
    if (token.length < MIN_ACCESS_TOKEN_LENGTH) {
      shortTokens += 1;
      continue;
    }
    if (seenIds.has(id)) {
      invalid += 1;
      continue;
    }
    seenIds.add(id);
    groups.push({
      id,
      name,
      token,
      notifications: parseNotifications(entry.notifications),
    });
    if (groups.length >= MAX_GROUPS) break;
  }

  logProblems(path, raw.length, shortTokens, invalid);
  cachedPath = path;
  cachedMtimeMs = mtimeMs;
  cachedGroups = groups;
  return groups;
}

export function findGroupByToken(token: string): GroupConfig | undefined {
  const trimmed = token.trim();
  if (!trimmed) return undefined;
  let hit: GroupConfig | undefined;
  for (const group of loadGroups()) {
    if (safeEqualString(trimmed, group.token)) hit = group;
  }
  return hit;
}

export function findGroupById(id: string): GroupConfig | undefined {
  return loadGroups().find((g) => g.id === id);
}
