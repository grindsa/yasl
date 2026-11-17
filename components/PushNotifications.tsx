"use client";

import { useEffect, useState } from "react";

type PushConfig = {
  enabled: boolean;
  vapidPublicKey: string | null;
  debounceSeconds: number | null;
};

type InAppToast = {
  id: number;
  body: string;
  url: string;
};

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const DISMISS_KEY = "yasl_push_prompt_dismissed";

export function PushNotifications() {
  const [promptVisible, setPromptVisible] = useState(false);
  const [toast, setToast] = useState<InAppToast | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    let cancelled = false;
    let toastTimer: number | undefined;

    const showToast = (body: string, url: string) => {
      const id = Date.now();
      setToast({ id, body, url });
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        setToast((cur) => (cur?.id === id ? null : cur));
      }, 6000);
    };

    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type?: string; body?: string; url?: string }
        | undefined;
      if (!data || typeof data !== "object") return;
      if (data.type === "yasl-notify") {
        showToast(
          typeof data.body === "string"
            ? data.body
            : "Liste wurde aktualisiert",
          typeof data.url === "string" ? data.url : "/",
        );
        return;
      }
      if (data.type === "yasl-navigate" && typeof data.url === "string") {
        window.location.assign(data.url);
      }
    };

    navigator.serviceWorker.addEventListener("message", onMessage);

    const run = async () => {
      try {
        const res = await fetch("/api/push/config", { cache: "no-store" });
        if (cancelled || res.status === 401 || !res.ok) return;
        const config = (await res.json()) as PushConfig;
        if (!config.enabled || !config.vapidPublicKey) return;

        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
        });
        await navigator.serviceWorker.ready;

        const permission = Notification.permission;
        if (permission === "granted") {
          await ensureSubscription(registration, config.vapidPublicKey);
          return;
        }
        if (permission === "denied") return;
        if (sessionStorage.getItem(DISMISS_KEY) === "1") return;
        if (!cancelled) setPromptVisible(true);
      } catch {
        /* push is best-effort */
      }
    };

    void run();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("message", onMessage);
      if (toastTimer) window.clearTimeout(toastTimer);
    };
  }, []);

  const enablePush = async () => {
    setPromptVisible(false);
    try {
      const res = await fetch("/api/push/config", { cache: "no-store" });
      if (!res.ok) return;
      const config = (await res.json()) as PushConfig;
      if (!config.enabled || !config.vapidPublicKey) return;

      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;
      await ensureSubscription(registration, config.vapidPublicKey);
    } catch {
      /* ignore */
    }
  };

  const dismissPrompt = () => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setPromptVisible(false);
  };

  return (
    <>
      {promptVisible ? (
        <div
          role="dialog"
          aria-label="Benachrichtigungen"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 w-[min(100%-1.5rem,28rem)] rounded-xl border border-hairline bg-panel-strong px-4 py-3 shadow-lg backdrop-blur-md"
        >
          <p className="text-sm text-foreground">
            Benachrichtigungen erhalten, wenn die Einkaufsliste geändert wurde?
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void enablePush()}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent"
            >
              Aktivieren
            </button>
            <button
              type="button"
              onClick={dismissPrompt}
              className="rounded-lg px-3 py-1.5 text-sm text-muted"
            >
              Nicht jetzt
            </button>
          </div>
        </div>
      ) : null}

      {toast ? (
        <a
          href={toast.url}
          className="fixed inset-x-0 top-0 z-50 mx-auto mt-3 w-[min(100%-1.5rem,28rem)] rounded-xl border border-hairline bg-panel-strong px-4 py-3 text-sm text-foreground shadow-lg backdrop-blur-md transition-opacity"
          onClick={() => setToast(null)}
        >
          {toast.body}
        </a>
      ) : null}
    </>
  );
}

async function ensureSubscription(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
): Promise<void> {
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        vapidPublicKey,
      ) as BufferSource,
    });
  }

  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}
