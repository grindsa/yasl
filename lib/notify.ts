import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { dataRoot, groupDataDir } from "./data-paths";
import { findGroupById, loadGroups } from "./groups-config";
import { isPushConfigured, sendListChangePush } from "./push";

type PendingListNotify = {
  listName: string;
  notifyAt: string;
};

type PendingFile = {
  lists?: Record<string, PendingListNotify>;
};

const locks = new Map<string, Promise<unknown>>();
let flushTimer: ReturnType<typeof setInterval> | null = null;
let flushing = false;

function pendingPath(groupId: string): string {
  return join(groupDataDir(groupId), "notify-pending.yml");
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

async function readPending(
  groupId: string,
): Promise<Record<string, PendingListNotify>> {
  const path = pendingPath(groupId);
  if (!existsSync(/*turbopackIgnore: true*/ path)) return {};
  try {
    const text = await readFile(path, "utf8");
    const parsed = parseYaml(text) as PendingFile;
    const lists = parsed?.lists;
    if (!lists || typeof lists !== "object" || Array.isArray(lists)) return {};
    const out: Record<string, PendingListNotify> = {};
    for (const [listId, entry] of Object.entries(lists)) {
      if (
        entry &&
        typeof entry.listName === "string" &&
        typeof entry.notifyAt === "string"
      ) {
        out[listId] = {
          listName: entry.listName,
          notifyAt: entry.notifyAt,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function writePending(
  groupId: string,
  lists: Record<string, PendingListNotify>,
): Promise<void> {
  const dir = groupDataDir(groupId);
  await mkdir(dir, { recursive: true });
  const path = pendingPath(groupId);
  if (Object.keys(lists).length === 0) {
    try {
      await unlink(path);
    } catch {
      /* missing is fine */
    }
    return;
  }
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  const text = stringifyYaml(
    { lists },
    { lineWidth: 0, defaultStringType: "QUOTE_DOUBLE" },
  );
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
}

/**
 * After an item add/remove: (re)arm a debounced push for this list when the
 * group has notifications enabled and VAPID is configured.
 */
export async function scheduleListChangeNotification(
  groupId: string,
  listId: string,
  listName: string,
): Promise<void> {
  const group = findGroupById(groupId);
  if (!group?.notifications.enabled) return;
  if (!isPushConfigured()) return;

  const debounceMs = group.notifications.debounceSeconds * 1000;
  const notifyAt = new Date(Date.now() + debounceMs).toISOString();

  await withLock(groupId, async () => {
    const lists = await readPending(groupId);
    lists[listId] = {
      listName: listName.trim() || listId,
      notifyAt,
    };
    await writePending(groupId, lists);
  });
}

async function takeDueNotifications(
  groupId: string,
  nowMs: number,
): Promise<Array<{ listId: string; listName: string }>> {
  return withLock(groupId, async () => {
    const lists = await readPending(groupId);
    const due: Array<{ listId: string; listName: string }> = [];
    const remaining: Record<string, PendingListNotify> = {};

    for (const [listId, entry] of Object.entries(lists)) {
      const at = Date.parse(entry.notifyAt);
      if (Number.isFinite(at) && at <= nowMs) {
        due.push({ listId, listName: entry.listName });
      } else {
        remaining[listId] = entry;
      }
    }

    if (due.length > 0) {
      await writePending(groupId, remaining);
    }
    return due;
  });
}

async function groupIdsWithData(): Promise<string[]> {
  const fromConfig = loadGroups().map((g) => g.id);
  const root = join(dataRoot(), "groups");
  if (!existsSync(/*turbopackIgnore: true*/ root)) return fromConfig;
  try {
    const dirs = await readdir(root, { withFileTypes: true });
    const fromDisk = dirs.filter((d) => d.isDirectory()).map((d) => d.name);
    return [...new Set([...fromConfig, ...fromDisk])];
  } catch {
    return fromConfig;
  }
}

/** Send any notifications whose debounce window has elapsed. */
export async function flushDueNotifications(): Promise<void> {
  if (flushing) return;
  if (!isPushConfigured()) return;
  flushing = true;
  try {
    const nowMs = Date.now();
    const groupIds = await groupIdsWithData();
    for (const groupId of groupIds) {
      const group = findGroupById(groupId);
      if (!group?.notifications.enabled) continue;

      const due = await takeDueNotifications(groupId, nowMs);
      for (const entry of due) {
        await sendListChangePush(groupId, {
          title: "YASL",
          body: `„${entry.listName}“ wurde aktualisiert`,
          url: `/lists/${entry.listId}`,
          listId: entry.listId,
          groupId,
        });
      }
    }
  } catch (err) {
    console.error("[notify] flush failed:", err);
  } finally {
    flushing = false;
  }
}

/** Start a lightweight interval (idempotent). Call from instrumentation. */
export function startNotifyScheduler(): void {
  if (flushTimer) return;
  if (!isPushConfigured()) {
    console.info("[notify] VAPID keys missing — push scheduler idle");
    return;
  }
  // First pass soon after boot (recover pending across restarts).
  void flushDueNotifications();
  flushTimer = setInterval(() => {
    void flushDueNotifications();
  }, 15_000);
  // Don't keep the process alive solely for this timer in edge cases.
  if (typeof flushTimer === "object" && "unref" in flushTimer) {
    flushTimer.unref();
  }
  console.info("[notify] debounce flush scheduler started (15s)");
}
