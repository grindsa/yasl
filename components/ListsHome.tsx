"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type ListSummary = {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
};

/** Cherry Blossoms–derived tones so each list reads as its own chip. */
const LIST_TONES = [
  { bar: "#c98e70", bg: "rgba(201, 142, 112, 0.18)" },
  { bar: "#7dbcc5", bg: "rgba(125, 188, 197, 0.22)" },
  { bar: "#5e5e5e", bg: "rgba(94, 94, 94, 0.12)" },
  { bar: "#e0b09a", bg: "rgba(224, 176, 154, 0.28)" },
  { bar: "#9bc9cf", bg: "rgba(155, 201, 207, 0.28)" },
  { bar: "#b07a62", bg: "rgba(176, 122, 98, 0.20)" },
  { bar: "#6aa8b0", bg: "rgba(106, 168, 176, 0.22)" },
  { bar: "#8a8a8a", bg: "rgba(138, 138, 138, 0.14)" },
] as const;

function toneForList(index: number) {
  return LIST_TONES[index % LIST_TONES.length];
}

export function ListsHome({ groupName }: { groupName: string }) {
  const router = useRouter();
  const [lists, setLists] = useState<ListSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch("/api/lists", { cache: "no-store" });
          if (cancelled) return;
          if (res.status === 401) {
            router.refresh();
            return;
          }
          if (!res.ok) throw new Error("load_failed");
          const data = (await res.json()) as { lists: ListSummary[] };
          if (cancelled) return;
          setLists(data.lists);
          setError(null);
        } catch {
          if (!cancelled) setError("Listen konnten nicht geladen werden.");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [router, reloadToken]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.refresh();
  }

  async function createList(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        list?: { id: string };
      };
      if (!res.ok || !data.list) {
        setError("Liste konnte nicht angelegt werden.");
        return;
      }
      setNewName("");
      router.push(`/lists/${data.list.id}`);
    } catch {
      setError("Liste konnte nicht angelegt werden.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-5 py-6">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-3xl font-semibold tracking-tight text-accent">
            YASL
          </p>
          <p className="mt-1 text-sm text-muted">Gruppe {groupName}</p>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          className="text-sm text-muted underline-offset-2 hover:underline"
        >
          Abmelden
        </button>
      </header>

      <h1 className="mb-4 text-xl font-semibold">Meine Einkaufszettel</h1>

      {error ? (
        <p className="mb-4 text-sm text-danger" role="alert">
          {error}{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setReloadToken((n) => n + 1)}
          >
            Erneut
          </button>
        </p>
      ) : null}

      <ul className="mb-6 flex flex-col gap-2.5">
        {lists === null ? (
          <li className="rounded-2xl border border-hairline bg-white/60 px-4 py-6 text-sm text-muted">
            Laden…
          </li>
        ) : lists.length === 0 ? (
          <li className="rounded-2xl border border-hairline bg-white/60 px-4 py-6 text-sm text-muted">
            Noch keine Listen — lege die erste an.
          </li>
        ) : (
          lists.map((list, index) => {
            const tone = toneForList(index);
            return (
              <li key={list.id}>
                <Link
                  href={`/lists/${list.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-hairline px-4 py-4 transition hover:brightness-[0.98]"
                  style={{
                    backgroundColor: tone.bg,
                    borderLeftWidth: 4,
                    borderLeftColor: tone.bar,
                  }}
                >
                  <span className="font-medium">{list.name}</span>
                  <span className="text-sm text-muted">
                    {list.itemCount} Artikel
                  </span>
                </Link>
              </li>
            );
          })
        )}
      </ul>

      <form onSubmit={createList} className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Name der neuen Liste"
          className="min-w-0 flex-1 rounded-xl border border-hairline bg-white/70 px-3 py-3 text-base outline-none ring-accent focus:ring-2"
        />
        <button
          type="submit"
          disabled={creating || !newName.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 py-3 font-semibold text-on-accent disabled:opacity-50"
        >
          Neue Liste
        </button>
      </form>
    </main>
  );
}
