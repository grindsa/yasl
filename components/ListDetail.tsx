"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import {
  BarcodeScanner,
  type ScanFeedback,
} from "@/components/BarcodeScanner";
import { SortableListItems } from "@/components/SortableListItems";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { DepartmentId } from "@/lib/departments";
import { unlockScanAudio } from "@/lib/scan-feedback";

type ListItem = {
  id: string;
  name: string;
  addedAt: string;
  department?: DepartmentId;
};
type ShoppingList = {
  id: string;
  name: string;
  revision: number;
  items: ListItem[];
};
type ArchiveItem = {
  id: string;
  name: string;
  addCount: number;
};

const POLL_MS = 1800;

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function ScanIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </svg>
  );
}

export function ListDetail({
  listId,
  departmentsEnabled = false,
}: {
  listId: string;
  departmentsEnabled?: boolean;
}) {
  const router = useRouter();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [top, setTop] = useState<ArchiveItem[]>([]);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<ArchiveItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [topTick, setTopTick] = useState(0);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [renamingBusy, setRenamingBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback>(null);
  const [pendingBarcode, setPendingBarcode] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const revisionRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scanBusyRef = useRef(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = async (silent: boolean) => {
      try {
        if (silent && draggingRef.current) return;
        const headers: HeadersInit = {};
        if (revisionRef.current != null) {
          headers["If-None-Match"] = `"${revisionRef.current}"`;
        }
        const res = await fetch(`/api/lists/${listId}`, {
          cache: "no-store",
          headers,
        });
        if (cancelled) return;
        if (res.status === 401) {
          router.refresh();
          return;
        }
        if (res.status === 304) return;
        if (res.status === 404) {
          setError("Liste nicht gefunden.");
          setList(null);
          return;
        }
        if (!res.ok) throw new Error("load_failed");
        const data = (await res.json()) as { list: ShoppingList };
        if (cancelled) return;
        revisionRef.current = data.list.revision;
        setList(data.list);
        if (!silent) setError(null);
      } catch {
        if (!cancelled && !silent) {
          setError("Liste konnte nicht geladen werden.");
        }
      }
    };

    const boot = window.setTimeout(() => {
      void fetchOnce(false);
    }, 0);
    const poll = window.setInterval(() => {
      void fetchOnce(true);
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(boot);
      window.clearInterval(poll);
    };
  }, [listId, router]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/archive/top", { cache: "no-store" });
          if (!res.ok || cancelled) return;
          const data = (await res.json()) as { items: ArchiveItem[] };
          if (!cancelled) setTop(data.items);
        } catch {
          /* ignore */
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [topTick]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/archive?q=${encodeURIComponent(q)}`,
            { cache: "no-store" },
          );
          if (!res.ok || cancelled) return;
          const data = (await res.json()) as { items: ArchiveItem[] };
          if (!cancelled) setSuggestions(data.items);
        } catch {
          /* ignore */
        }
      })();
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  async function addItem(payload: {
    name?: string;
    id?: string;
    barcode?: string;
  }): Promise<{ ok: boolean; error?: string; itemName?: string }> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        list?: ShoppingList;
        item?: { name?: string };
        barcode?: string;
        reason?: string;
      };
      if (res.status === 409) {
        setError("Artikel ist schon auf der Liste.");
        return { ok: false, error: "already_on_list" };
      }
      if (res.status === 404 && data.error === "needs_name") {
        return { ok: false, error: "needs_name" };
      }
      if (!res.ok || !data.list) {
        setError("Artikel konnte nicht hinzugefügt werden.");
        return { ok: false, error: data.error ?? "failed" };
      }
      revisionRef.current = data.list.revision;
      setList(data.list);
      setQuery("");
      setSuggestions([]);
      setTopTick((n) => n + 1);
      inputRef.current?.focus();
      return { ok: true, itemName: data.item?.name };
    } catch {
      setError("Artikel konnte nicht hinzugefügt werden.");
      return { ok: false, error: "failed" };
    } finally {
      setBusy(false);
    }
  }

  const onBarcodeDetected = useCallback(
    async (barcode: string) => {
      if (scanBusyRef.current) return;
      scanBusyRef.current = true;
      setScanFeedback({
        kind: "pending",
        title: "Code erkannt…",
        detail: barcode,
      });
      try {
        const res = await fetch(`/api/lists/${listId}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ barcode }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          list?: ShoppingList;
          item?: { name?: string };
        };
        if (res.status === 409) {
          setScanFeedback({
            kind: "warn",
            title: "Schon auf der Liste",
            detail: barcode,
          });
          window.setTimeout(() => {
            setScanFeedback((prev) => (prev?.kind === "warn" ? null : prev));
          }, 2000);
          return;
        }
        if (res.status === 404 && data.error === "needs_name") {
          setPendingBarcode(barcode);
          setManualName("");
          setScanFeedback(null);
          setScannerOpen(false);
          return;
        }
        if (!res.ok || !data.list) {
          setScanFeedback({
            kind: "error",
            title: "Nicht hinzugefügt",
            detail: "Bitte erneut scannen",
          });
          return;
        }
        revisionRef.current = data.list.revision;
        setList(data.list);
        setTopTick((n) => n + 1);
        setScanFeedback({
          kind: "success",
          title: data.item?.name ?? "Hinzugefügt",
          detail: "Auf dem Einkaufszettel",
        });
        window.setTimeout(() => {
          setScanFeedback((prev) =>
            prev?.kind === "success" ? null : prev,
          );
        }, 2200);
      } catch {
        setScanFeedback({
          kind: "error",
          title: "Fehler",
          detail: "Bitte erneut scannen",
        });
      } finally {
        window.setTimeout(() => {
          scanBusyRef.current = false;
        }, 800);
      }
    },
    [listId],
  );

  async function submitManualBarcodeName(e: FormEvent) {
    e.preventDefault();
    if (!pendingBarcode || !manualName.trim()) return;
    const result = await addItem({
      barcode: pendingBarcode,
      name: manualName.trim(),
    });
    if (result.ok) {
      setPendingBarcode(null);
      setManualName("");
      setScanFeedback({
        kind: "success",
        title: result.itemName ?? "Hinzugefügt",
        detail: "Auf dem Einkaufszettel",
      });
      setScannerOpen(true);
      window.setTimeout(() => {
        setScanFeedback((prev) => (prev?.kind === "success" ? null : prev));
      }, 2200);
    }
  }

  async function removeItem(itemId: string) {
    const prev = list;
    if (prev) {
      setList({
        ...prev,
        items: prev.items.filter((i) => i.id !== itemId),
      });
    }
    try {
      const res = await fetch(`/api/lists/${listId}/items/${itemId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        if (prev) setList(prev);
        return;
      }
      const data = (await res.json()) as { list: ShoppingList };
      revisionRef.current = data.list.revision;
      setList(data.list);
    } catch {
      if (prev) setList(prev);
    }
  }

  async function reorderItems(nextItems: ListItem[]) {
    const prev = list;
    if (!prev) return;
    setList({ ...prev, items: nextItems });
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: nextItems.map((i) => i.id) }),
      });
      if (!res.ok) {
        if (prev) setList(prev);
        setError("Reihenfolge konnte nicht gespeichert werden.");
        return;
      }
      const data = (await res.json()) as { list: ShoppingList };
      revisionRef.current = data.list.revision;
      setList(data.list);
    } catch {
      if (prev) setList(prev);
      setError("Reihenfolge konnte nicht gespeichert werden.");
    }
  }

  async function sortByDepartment() {
    const prev = list;
    if (!prev || prev.items.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}/items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortBy: "department" }),
      });
      if (!res.ok) {
        setError("Sortierung nach Abteilung fehlgeschlagen.");
        return;
      }
      const data = (await res.json()) as { list: ShoppingList };
      revisionRef.current = data.list.revision;
      setList(data.list);
    } catch {
      setError("Sortierung nach Abteilung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function changeDepartment(itemId: string, department: DepartmentId) {
    const prev = list;
    if (prev) {
      setList({
        ...prev,
        items: prev.items.map((i) =>
          i.id === itemId ? { ...i, department } : i,
        ),
      });
    }
    try {
      const res = await fetch(`/api/archive/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department }),
      });
      if (!res.ok) {
        if (prev) setList(prev);
        setError("Abteilung konnte nicht gespeichert werden.");
        return;
      }
    } catch {
      if (prev) setList(prev);
      setError("Abteilung konnte nicht gespeichert werden.");
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = query.trim();
    if (!name || busy) return;
    const exact = suggestions.find(
      (s) => s.name.toLowerCase() === name.toLowerCase(),
    );
    void addItem(exact ? { id: exact.id } : { name });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setSuggestions([]);
    }
  }

  function startRename() {
    if (!list) return;
    setDraftName(list.name);
    setRenaming(true);
    queueMicrotask(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    });
  }

  function cancelRename() {
    setRenaming(false);
    setDraftName("");
  }

  async function saveRename(e?: FormEvent) {
    e?.preventDefault();
    if (!list) return;
    const name = draftName.trim();
    if (!name) {
      setError("Name darf nicht leer sein.");
      return;
    }
    if (name === list.name) {
      cancelRename();
      return;
    }
    setRenamingBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        list?: ShoppingList;
      };
      if (!res.ok || !data.list) {
        setError("Liste konnte nicht umbenannt werden.");
        return;
      }
      revisionRef.current = data.list.revision;
      setList(data.list);
      setRenaming(false);
      setDraftName("");
    } catch {
      setError("Liste konnte nicht umbenannt werden.");
    } finally {
      setRenamingBusy(false);
    }
  }

  async function deleteList() {
    if (!list) return;
    if (!window.confirm(`Liste „${list.name}“ wirklich löschen?`)) return;
    const res = await fetch(`/api/lists/${listId}`, { method: "DELETE" });
    if (res.ok) router.push("/");
  }

  if (!list && error) {
    return (
      <main className="mx-auto max-w-lg px-5 py-8">
        <p className="text-danger">{error}</p>
        <Link href="/" className="mt-4 inline-block text-accent underline">
          Zurück
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-6">
      <header className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="text-sm text-muted underline-offset-2 hover:underline"
          >
            ← Listen
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            {!renaming && list ? (
              <button
                type="button"
                onClick={startRename}
                className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-foreground"
                aria-label="Umbenennen"
                title="Umbenennen"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void deleteList()}
              className="rounded-lg p-2 text-muted transition hover:bg-surface hover:text-danger"
              aria-label="Löschen"
              title="Löschen"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        {renaming ? (
          <form
            onSubmit={(e) => void saveRename(e)}
            className="flex flex-col gap-2 sm:flex-row sm:items-center"
          >
            <input
              ref={renameInputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelRename();
              }}
              disabled={renamingBusy}
              className="min-w-0 flex-1 rounded-xl border border-hairline bg-panel-strong px-3 py-2 text-xl font-semibold outline-none ring-accent focus:ring-2"
              aria-label="Neuer Listenname"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={renamingBusy || !draftName.trim()}
                className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
              >
                Speichern
              </button>
              <button
                type="button"
                onClick={cancelRename}
                disabled={renamingBusy}
                className="rounded-xl px-3 py-2 text-sm text-muted"
              >
                Abbrechen
              </button>
            </div>
          </form>
        ) : (
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {list?.name ?? "…"}
          </h1>
        )}
      </header>

      <div className="relative mb-4 flex gap-2">
        <form onSubmit={onSubmit} className="relative min-w-0 flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              const value = e.target.value;
              setQuery(value);
              if (!value.trim()) setSuggestions([]);
            }}
            onKeyDown={onKeyDown}
            placeholder="Artikel suchen oder hinzufügen"
            autoComplete="off"
            className="w-full rounded-xl border border-hairline bg-panel-strong px-4 py-3 text-base outline-none ring-accent focus:ring-2"
          />
          {suggestions.length > 0 && query.trim() ? (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-hairline bg-panel-strong shadow-sm">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left hover:bg-surface"
                    onClick={() => void addItem({ id: s.id })}
                  >
                    <span>{s.name}</span>
                    <span className="text-xs text-muted">{s.addCount}×</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </form>
        <button
          type="button"
          onClick={() => {
            void unlockScanAudio();
            setScanFeedback(null);
            setScannerOpen(true);
          }}
          className="shrink-0 rounded-xl border border-hairline bg-panel-strong p-3 text-accent transition hover:bg-accent-soft/40"
          aria-label="Barcode scannen"
          title="Barcode scannen"
        >
          <ScanIcon className="h-6 w-6" />
        </button>
      </div>

      {pendingBarcode ? (
        <form
          onSubmit={(e) => void submitManualBarcodeName(e)}
          className="mb-4 rounded-2xl border border-hairline bg-panel-strong p-4"
        >
          <p className="mb-2 text-sm text-muted">
            Unbekannter Code{" "}
            <span className="font-mono text-foreground">{pendingBarcode}</span>
            — kein Treffer im Archiv / Open Food Facts. Name eingeben:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Artikelname"
              className="min-w-0 flex-1 rounded-xl border border-hairline bg-panel-strong px-3 py-2 outline-none ring-accent focus:ring-2"
              autoFocus
            />
            <button
              type="submit"
              disabled={busy || !manualName.trim()}
              className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-on-accent disabled:opacity-50"
            >
              Speichern
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingBarcode(null);
                setManualName("");
              }}
              className="rounded-xl px-3 py-2 text-sm text-muted"
            >
              Abbrechen
            </button>
          </div>
        </form>
      ) : null}

      <BarcodeScanner
        open={scannerOpen}
        onClose={() => {
          setScannerOpen(false);
          setScanFeedback(null);
        }}
        onDetected={onBarcodeDetected}
        feedback={scanFeedback}
      />

      {error ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section className="mb-8 rounded-2xl border-2 border-sky bg-panel p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-sky">
            Auf der Liste
          </h2>
          {departmentsEnabled && list && list.items.length > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void sortByDepartment()}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-sky transition hover:bg-sky/10 disabled:opacity-50"
            >
              Nach Laufweg
            </button>
          ) : null}
        </div>
        {!list ? (
          <ul className="overflow-hidden rounded-xl bg-panel">
            <li className="px-4 py-5 text-sm text-muted">Laden…</li>
          </ul>
        ) : list.items.length === 0 ? (
          <ul className="overflow-hidden rounded-xl bg-panel">
            <li className="px-4 py-5 text-sm text-muted">
              Noch leer — tippe oben einen Artikel ein.
            </li>
          </ul>
        ) : (
          <SortableListItems
            items={list.items}
            departmentsEnabled={departmentsEnabled}
            onRemove={(id) => void removeItem(id)}
            onReorder={(next) => void reorderItems(next)}
            onDepartmentChange={
              departmentsEnabled
                ? (id, department) => void changeDepartment(id, department)
                : undefined
            }
            onDragStateChange={(dragging) => {
              draggingRef.current = dragging;
            }}
          />
        )}
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Top 5
        </h2>
        {top.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Statistik.</p>
        ) : (
          <ul className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-panel">
            {top.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={busy || !!list?.items.some((i) => i.id === item.id)}
                  onClick={() => void addItem({ id: item.id })}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-xs disabled:opacity-40"
                >
                  <span>{item.name}</span>
                  <span className="text-xs text-muted">{item.addCount}×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
