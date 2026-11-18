import {
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  classifyItem,
  departmentSortIndex,
  isDepartmentId,
  type DepartmentId,
  type DepartmentSource,
} from "./departments";
import { groupDataDir } from "./data-paths";
import { departmentsEnabled } from "./features";
import { slugify } from "./slug";

/** Matches ids produced by slugify / uniqueId — rejects path separators and `..`. */
const SAFE_LIST_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isSafeListId(listId: string): boolean {
  return SAFE_LIST_ID.test(listId);
}

export type ArchiveItem = {
  id: string;
  name: string;
  addCount: number;
  lastAddedAt: string;
  barcode: string | null;
  /** Only set/used when ENABLE_DEPARTMENTS is on. */
  department?: DepartmentId;
  departmentSource?: DepartmentSource;
};

export type ListItem = {
  id: string;
  name: string;
  addedAt: string;
  /** Optional free-text (qty, weight, brand…); list-scoped only. */
  note?: string;
  /** Present on API responses; joined from archive. */
  department?: DepartmentId;
};

const NOTE_MAX_LENGTH = 200;

function normalizeNote(note: unknown): string | undefined {
  if (typeof note !== "string") return undefined;
  const trimmed = note.trim().slice(0, NOTE_MAX_LENGTH);
  return trimmed || undefined;
}

function leanListItem(item: ListItem): ListItem {
  const note = normalizeNote(item.note);
  return {
    id: item.id,
    name: item.name,
    addedAt: item.addedAt,
    ...(note ? { note } : {}),
  };
}

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

function groupDir(groupId: string): string {
  return groupDataDir(groupId);
}

function archivePath(groupId: string): string {
  return join(groupDir(groupId), "archive.yml");
}

function listsDir(groupId: string): string {
  return join(groupDir(groupId), "lists");
}

function listPath(groupId: string, listId: string): string {
  if (!isSafeListId(listId)) {
    throw new StoreError("not_found", 404);
  }
  const dir = listsDir(groupId);
  const path = join(dir, `${listId}.yml`);
  const resolvedDir = resolve(/*turbopackIgnore: true*/ dir);
  const resolvedPath = resolve(/*turbopackIgnore: true*/ path);
  if (
    resolvedPath !== resolvedDir &&
    !resolvedPath.startsWith(resolvedDir + sep)
  ) {
    throw new StoreError("not_found", 404);
  }
  return path;
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

function normalizeDepartmentSource(
  value: unknown,
): DepartmentSource | null {
  if (value === "rule" || value === "off" || value === "user") return value;
  return null;
}

function ensureArchiveDepartment(
  item: Omit<ArchiveItem, "department" | "departmentSource"> & {
    department?: unknown;
    departmentSource?: unknown;
  },
  offTags?: string[] | null,
): ArchiveItem {
  if (!departmentsEnabled()) {
    const existingSource = normalizeDepartmentSource(item.departmentSource);
    return {
      ...item,
      department: isDepartmentId(item.department) ? item.department : undefined,
      departmentSource: existingSource ?? undefined,
    };
  }
  const existingSource = normalizeDepartmentSource(item.departmentSource);
  if (isDepartmentId(item.department) && existingSource === "user") {
    return {
      ...item,
      department: item.department,
      departmentSource: "user",
    };
  }
  if (isDepartmentId(item.department) && existingSource) {
    return {
      ...item,
      department: item.department,
      departmentSource: existingSource,
    };
  }
  const classified = classifyItem({ name: item.name, offTags });
  return {
    ...item,
    department: classified.department,
    departmentSource: classified.source,
  };
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
    .map((i) =>
      ensureArchiveDepartment({
        id: i.id,
        name: i.name,
        addCount: Math.max(0, Math.floor(i.addCount)),
        lastAddedAt:
          typeof i.lastAddedAt === "string"
            ? i.lastAddedAt
            : new Date(0).toISOString(),
        barcode: typeof i.barcode === "string" ? i.barcode : null,
        department: (i as ArchiveItem).department,
        departmentSource: (i as ArchiveItem).departmentSource,
      }),
    );
}

function enrichListItems(
  list: ShoppingList,
  archive: ArchiveItem[],
): ShoppingList {
  if (!departmentsEnabled()) {
    return {
      ...list,
      items: list.items.map(leanListItem),
    };
  }
  const byId = new Map(archive.map((a) => [a.id, a]));
  return {
    ...list,
    items: list.items.map((item) => ({
      ...leanListItem(item),
      department:
        byId.get(item.id)?.department ??
        classifyItem({ name: item.name }).department,
    })),
  };
}

function normalizeList(raw: ShoppingList | null, fallbackId: string): ShoppingList | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") {
    return null;
  }
  const items = Array.isArray(raw.items)
    ? raw.items
        .filter(
          (i): i is ListItem =>
            !!i &&
            typeof i.id === "string" &&
            typeof i.name === "string" &&
            typeof i.addedAt === "string",
        )
        .map(leanListItem)
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
  // Department is archive-owned; keep list YAML lean (note stays list-scoped).
  const toSave: ShoppingList = {
    ...list,
    items: list.items.map(leanListItem),
  };
  await writeYamlAtomic(listPath(groupId, list.id), toSave);
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
    const archive = await loadArchive(groupId);
    return enrichListItems(list, archive);
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
  if (!isSafeListId(listId)) return null;
  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) return null;
    const archive = await loadArchive(groupId);
    return enrichListItems(list, archive);
  });
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
  input: {
    name?: string;
    id?: string;
    barcode?: string;
    note?: string;
    offTags?: string[] | null;
  },
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
        if (departmentsEnabled()) {
          const classified = classifyItem({
            name,
            offTags: input.offTags,
          });
          archiveItem.department = classified.department;
          archiveItem.departmentSource = classified.source;
        }
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
        if (departmentsEnabled()) {
          const classified = classifyItem({
            name,
            offTags: input.offTags,
          });
          archiveItem.department = classified.department;
          archiveItem.departmentSource = classified.source;
        }
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

    // Upgrade auto classification from OFF tags when user has not overridden.
    if (
      departmentsEnabled() &&
      input.offTags?.length &&
      archiveItem.departmentSource !== "user"
    ) {
      const classified = classifyItem({
        name: archiveItem.name,
        offTags: input.offTags,
      });
      if (classified.source === "off") {
        archiveItem.department = classified.department;
        archiveItem.departmentSource = "off";
      }
    }

    archiveItem.addCount += 1;
    archiveItem.lastAddedAt = now;
    await saveArchive(groupId, archive);

    const note = normalizeNote(input.note);
    const item: ListItem = {
      id: archiveItem.id,
      name: archiveItem.name,
      addedAt: now,
      ...(note ? { note } : {}),
      ...(departmentsEnabled() && archiveItem.department
        ? { department: archiveItem.department }
        : {}),
    };
    list.items.push(item);
    list.revision += 1;
    list.updatedAt = now;
    await saveList(groupId, list);
    return {
      list: enrichListItems(list, archive),
      item,
      source,
    };
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
    const archive = await loadArchive(groupId);
    return enrichListItems(list, archive);
  });
}

/** Set or clear list-scoped free-text note on an item. */
export async function updateListItemNote(
  groupId: string,
  listId: string,
  itemId: string,
  note: unknown,
): Promise<ShoppingList> {
  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) throw new StoreError("not_found", 404);
    const index = list.items.findIndex((i) => i.id === itemId);
    if (index < 0) throw new StoreError("item_not_found", 404);

    const current = list.items[index]!;
    const normalized = normalizeNote(note);
    list.items[index] = leanListItem({
      ...current,
      note: normalized,
    });
    list.revision += 1;
    list.updatedAt = new Date().toISOString();
    await saveList(groupId, list);
    const archive = await loadArchive(groupId);
    return enrichListItems(list, archive);
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
    const archive = await loadArchive(groupId);
    return enrichListItems(list, archive);
  });
}

/** Persist department on archive item (user override). */
export async function setArchiveDepartment(
  groupId: string,
  itemId: string,
  department: DepartmentId,
): Promise<ArchiveItem> {
  if (!departmentsEnabled()) {
    throw new StoreError("departments_disabled", 403);
  }
  if (!isDepartmentId(department)) {
    throw new StoreError("invalid_department", 400);
  }
  return withGroupLock(groupId, async () => {
    const archive = await loadArchive(groupId);
    const item = archive.find((a) => a.id === itemId);
    if (!item) throw new StoreError("archive_not_found", 404);
    item.department = department;
    item.departmentSource = "user";
    await saveArchive(groupId, archive);
    return item;
  });
}

/** Reorder list items by supermarket aisle order, then German name. */
export async function sortListByDepartment(
  groupId: string,
  listId: string,
): Promise<ShoppingList> {
  if (!departmentsEnabled()) {
    throw new StoreError("departments_disabled", 403);
  }
  return withGroupLock(groupId, async () => {
    const list = await loadList(groupId, listId);
    if (!list) throw new StoreError("not_found", 404);
    const archive = await loadArchive(groupId);
    const byId = new Map(archive.map((a) => [a.id, a]));

    for (const item of list.items) {
      if (byId.has(item.id)) continue;
      const classified = classifyItem({ name: item.name });
      const arch: ArchiveItem = {
        id: item.id,
        name: item.name,
        addCount: 0,
        lastAddedAt: item.addedAt,
        barcode: null,
        department: classified.department,
        departmentSource: classified.source,
      };
      archive.push(arch);
      byId.set(item.id, arch);
    }
    // Persist backfilled departments from normalize/classify.
    await saveArchive(groupId, archive);

    list.items = [...list.items].sort((a, b) => {
      const da =
        byId.get(a.id)?.department ??
        classifyItem({ name: a.name }).department;
      const db =
        byId.get(b.id)?.department ??
        classifyItem({ name: b.name }).department;
      const byDept = departmentSortIndex(da) - departmentSortIndex(db);
      if (byDept !== 0) return byDept;
      return a.name.localeCompare(b.name, "de", { sensitivity: "base" });
    });
    list.revision += 1;
    list.updatedAt = new Date().toISOString();
    await saveList(groupId, list);
    return enrichListItems(list, archive);
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

export { DEPARTMENT_IDS, DEPARTMENT_LABELS, isDepartmentId } from "./departments";
export type { DepartmentId, DepartmentSource } from "./departments";

export class StoreError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "StoreError";
  }
}
