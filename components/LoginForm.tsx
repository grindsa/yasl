"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

export function LoginForm() {
  const router = useRouter();
  const inputId = useId();
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        retryAfter?: number;
      };
      if (!res.ok || !data.ok) {
        if (data.error === "rate_limited") {
          setError(
            `Zu viele Versuche. Bitte in ${data.retryAfter ?? "?"} s erneut versuchen.`,
          );
        } else {
          setError("Zugangscode ungültig.");
        }
        return;
      }
      router.refresh();
    } catch {
      setError("Anmeldung fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-full w-full max-w-md flex-1 flex-col px-6 py-12">
      <div className="absolute right-6 top-6 z-10 sm:right-6">
        <ThemeToggle />
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-10 text-center">
          <p className="text-4xl font-semibold tracking-tight text-accent sm:text-5xl">
            YASL
          </p>
          <p className="mt-2 text-sm text-muted">Yet Another Shopping List</p>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-sm font-medium text-muted">
              Zugangscode
            </label>
            <input
              id={inputId}
              type="password"
              autoComplete="current-password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="rounded-xl border border-hairline bg-panel-strong px-4 py-3 text-base outline-none ring-accent focus:ring-2"
              placeholder="Gruppen-Token"
              required
              minLength={1}
            />
          </div>
          {error ? (
            <p className="text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting || !token.trim()}
            className="rounded-xl bg-accent px-4 py-3 text-base font-semibold text-on-accent disabled:opacity-50"
          >
            {submitting ? "…" : "Anmelden"}
          </button>
        </form>
      </div>
    </main>
  );
}
