import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { slugify } from "./slug";

export type ArchiveItem = {
  id: string;
  name: string;
  addCount: number;
  lastAddedAt: string;
  barcode: string | null;
};

export type ListItem = {
  id: string;
  name: string;
  addedAt: string;
};

export type ShoppingList = {
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
  items: ListItem[];
};

export type ListSummary = {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
};

type ArchiveFile = { items?: ArchiveItem[] };

const locks = new Map<string, Promise<unknown>>();

function dataRoot(): string {
  const override = process.env.DATA_DIR?.trim();
  if (override) return resolve(/*turbopackIgnore: true*/ override);
  return join(process.cwd(), "data");
}

function groupDir(groupId: string): string {
  return join(dataRoot(), "groups", groupId);
}

function archivePath(groupId: string): string {
  return join(groupDir(groupId), "archive.yml");
}

function listsDir(groupId: string): string {
  return join(groupDir(groupId), "lists");
}

function listPath(groupId: string, listId: string): string {
  return join(listsDir(groupId), `${listId}.yml`);
}

async function withGroupLock<T>(
  groupId: string,
  fn: () => Promise<T>,
): Promise<T> {
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

async function ensureGroupDirs(groupId: string): Promise<void> {
  await mkdir(listsDir(groupId), { recursive: true });
}

async function writeYamlAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp.${process.pid}.${Date.now()}`;
  const body = stringifyYaml(data, { lineWidth: 120 });
  await writeFile(tmp, body, "utf8");
  await rename(tmp, path);
}

async function readYamlFile<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, "utf8");
    return parseYaml(text) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

function normalizeArchive(raw: ArchiveFile | null): ArchiveItem[] {
  if (!raw || !Array.isArray(raw.items)) return [];
  return raw.items
    .filter(
      (i) =>
        i &&
        typeof i.id === "string" &&
        typeof i.name === "string" &&
        typeof i.addCount === "number",
    )
    .map((i) => ({
      id: i.id,
      name: i.name,
      addCount: Math.max(0, Math.floor(i.addCount)),
      lastAddedAt:
        typeof i.lastAddedAt === "string"
          ? i.lastAddedAt
          : new Date(0).toISOString(),
      barcode: typeof i.barcode === "string" ? i.barcode : null,
    }));
}

function normalizeList(raw: ShoppingList | null, fallbackId: string): ShoppingList | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") {
    return null;
  }
  const items = Array.isArray(raw.items)
    ? raw.items.filter(
        (i) =>
          i &&
          typeof i.id === "string" &&
          typeof i.name === "string" &&
          typeof i.addedAt === "string",
      )
    : [];
  return {
    id: raw.id || fallbackId,
    name: raw.name,
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    updatedAt:
      typeof raw.updatedAt === "string"
        ? raw.updatedAt
        : new Date(0).toISOString(),
    items,
  };
}

async function loadArchive(groupId: string): Promise<ArchiveItem[]> {
  const raw = await readYamlFile<ArchiveFile>(archivePath(groupId));
  return normalizeArchive(raw);
}

async function saveArchive(
  groupId: string,
  items: ArchiveItem[],
): Promise<void> {
  await ensureGroupDirs(groupId);
  await writeYamlAtomic(archivePath(groupId), { items });
}

async function loadList(
  groupId: string,
  listId: string,
): Promise<ShoppingList | null> {
  const raw = await readYamlFile<ShoppingList>(listPath(groupId, listId));
  return normalizeList(raw, listId);
}

async function saveList(groupId: string, list: ShoppingList): Promise<void> {
  await ensureGroupDirs(groupId);
  await writeYamlAtomic(listPath(groupId, list.id), list);
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function listSummaries(groupId: string): Promise<ListSummary[]> {
  return withGroupLock(groupId, async () => {
    await ensureGroupDirs(groupId);
    const dir = listsDir(groupId);
    if (!existsSync(dir)) return [];
    const files = await readdir(dir);
    const summaries: ListSummary[] = [];
    for (const file of files) {
      if (!file.endsWith(".yml") || file.includes(".tmp.")) continue;
      const id = file.slice(0, -4);
      const list = await loadList(groupId, id);
      if (!list) continue;
      summaries.push({
        id: list.id,
        name: list.name,
        itemCount: list.items.length,
        updatedAt: list.updatedAt,
      });
    }
    summaries.sort((a, b) =>
      a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
    );
    return summaries;
  });
}

export async function createList(
  groupId: string,
  name: string,
): Promise<ShoppingList> {
  const trimmed = name.trim();
  if (!trimmed) throw new StoreError("name_required", 400);

  return withGroupLock(groupId, async () => {
    await ensureGroupDirs(groupId);
    const existing = await readdir(listsDir(groupId));
    const taken = new Set(
      existing
        .filter((f) => f.endsWith(".yml"))
        .map((f) => f.slice(0, -4)),
    );
    const id = uniqueId(slugify(trimmed), taken);
    const now = new Date().toISOString();
    const list: ShoppingList = {
      id,
      name: trimmed,
      revision: 1,
      updatedAt: now,
      items: [],
    };
    await saveList(groupId, list);
    return list;
  });
}

export async function renameList(
  groupId: string,
  listId: string,
  name: string,
): Promise<ShoppingList> {
  const trimmed = name.trim();
  if (!trimmed) throw new StoreError("name_required", 400);

  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) throw new StoreError("not_found", 404);
    list.name = trimmed;
    list.revision += 1;
    list.updatedAt = new Date().toISOString();
    await saveList(groupId, list);
    return list;
  });
}

export async function deleteList(
  groupId: string,
  listId: string,
): Promise<void> {
  return withGroupLock(groupId, async () => {
    const path = listPath(groupId, listId);
    try {
      await unlink(path);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") throw new StoreError("not_found", 404);
      throw err;
    }
  });
}

export async function getList(
  groupId: string,
  listId: string,
): Promise<ShoppingList | null> {
  return withGroupLock(groupId, () => loadList(groupId, listId));
}

function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export async function findArchiveByBarcode(
  groupId: string,
  barcodeRaw: string,
): Promise<ArchiveItem | null> {
  const barcode = normalizeBarcode(barcodeRaw);
  if (!barcode) return null;
  return withGroupLock(groupId, async () => {
    const archive = await loadArchive(groupId);
    return (
      archive.find((a) => a.barcode && normalizeBarcode(a.barcode) === barcode) ??
      null
    );
  });
}

export async function addItemToList(
  groupId: string,
  listId: string,
  input: { name?: string; id?: string; barcode?: string },
): Promise<{ list: ShoppingList; item: ListItem; source?: string }> {
  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) throw new StoreError("not_found", 404);

    const archive = await loadArchive(groupId);
    const now = new Date().toISOString();
    const barcode = input.barcode
      ? normalizeBarcode(input.barcode)
      : undefined;
    if (input.barcode && (!barcode || barcode.length < 8)) {
      throw new StoreError("invalid_barcode", 400);
    }

    let archiveItem: ArchiveItem | undefined;
    let source = "archive";

    if (input.id) {
      archiveItem = archive.find((a) => a.id === input.id);
      if (!archiveItem) throw new StoreError("archive_not_found", 404);
    } else if (barcode) {
      archiveItem = archive.find(
        (a) => a.barcode && normalizeBarcode(a.barcode) === barcode,
      );
      if (!archiveItem) {
        const name = input.name?.trim() ?? "";
        if (!name) throw new StoreError("barcode_unknown", 404);
        const taken = new Set(archive.map((a) => a.id));
        const id = uniqueId(slugify(name), taken);
        archiveItem = {
          id,
          name,
          addCount: 0,
          lastAddedAt: now,
          barcode,
        };
        archive.push(archiveItem);
        source = "new";
      }
    } else {
      const name = input.name?.trim() ?? "";
      if (!name) throw new StoreError("name_required", 400);
      const nameLower = name.toLowerCase();
      archiveItem = archive.find((a) => a.name.toLowerCase() === nameLower);
      if (!archiveItem) {
        const taken = new Set(archive.map((a) => a.id));
        const id = uniqueId(slugify(name), taken);
        archiveItem = {
          id,
          name,
          addCount: 0,
          lastAddedAt: now,
          barcode: null,
        };
        archive.push(archiveItem);
        source = "new";
      }
    }

    if (list.items.some((i) => i.id === archiveItem!.id)) {
      throw new StoreError("already_on_list", 409);
    }

    // Attach barcode to existing archive item if scanned and missing.
    if (barcode && !archiveItem.barcode) {
      archiveItem.barcode = barcode;
    }

    archiveItem.addCount += 1;
    archiveItem.lastAddedAt = now;
    await saveArchive(groupId, archive);

    const item: ListItem = {
      id: archiveItem.id,
      name: archiveItem.name,
      addedAt: now,
    };
    list.items.push(item);
    list.revision += 1;
    list.updatedAt = now;
    await saveList(groupId, list);
    return { list, item, source };
  });
}

export async function removeItemFromList(
  groupId: string,
  listId: string,
  itemId: string,
): Promise<ShoppingList> {
  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) throw new StoreError("not_found", 404);
    const next = list.items.filter((i) => i.id !== itemId);
    if (next.length === list.items.length) {
      throw new StoreError("item_not_found", 404);
    }
    list.items = next;
    list.revision += 1;
    list.updatedAt = new Date().toISOString();
    await saveList(groupId, list);
    return list;
  });
}

/** Reorder items; `order` must be a permutation of current item ids. */
export async function reorderListItems(
  groupId: string,
  listId: string,
  order: string[],
): Promise<ShoppingList> {
  if (!Array.isArray(order) || order.length === 0) {
    throw new StoreError("order_required", 400);
  }

  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) throw new StoreError("not_found", 404);

    if (order.length !== list.items.length) {
      throw new StoreError("order_mismatch", 400);
    }
    const byId = new Map(list.items.map((i) => [i.id, i]));
    if (new Set(order).size !== order.length) {
      throw new StoreError("order_mismatch", 400);
    }
    const next: ListItem[] = [];
    for (const id of order) {
      const item = byId.get(id);
      if (!item) throw new StoreError("order_mismatch", 400);
      next.push(item);
    }
    list.items = next;
    list.revision += 1;
    list.updatedAt = new Date().toISOString();
    await saveList(groupId, list);
    return list;
  });
}

export async function searchArchive(
  groupId: string,
  query: string,
  limit = 12,
): Promise<ArchiveItem[]> {
  return withGroupLock(groupId, async () => {
    const archive = await loadArchive(groupId);
    const q = query.trim().toLowerCase();
    if (!q) {
      return [...archive]
        .sort((a, b) => b.addCount - a.addCount)
        .slice(0, limit);
    }
    return archive
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return b.addCount - a.addCount;
      })
      .slice(0, limit);
  });
}

export async function topArchive(
  groupId: string,
  limit = 5,
): Promise<ArchiveItem[]> {
  return withGroupLock(groupId, async () => {
    const archive = await loadArchive(groupId);
    return [...archive]
      .filter((a) => a.addCount > 0)
      .sort((a, b) => b.addCount - a.addCount || a.name.localeCompare(b.name, "de"))
      .slice(0, limit);
  });
}

export class StoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "StoreError";
  }
}
