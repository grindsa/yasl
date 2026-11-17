/* YASL service worker — Web Push + click handling */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * If a visible/focused app window exists, deliver in-app via postMessage.
 * Otherwise show an OS/browser notification.
 */
self.addEventListener("push", (event) => {
  let data = {
    title: "YASL",
    body: "Liste wurde aktualisiert",
    url: "/",
    listId: null,
    groupId: null,
  };
  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch {
    /* keep defaults */
  }

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const openClients = clients.filter(
        (c) => c.visibilityState === "visible" || c.focused,
      );

      if (openClients.length > 0) {
        for (const client of clients) {
          client.postMessage({ type: "yasl-notify", ...data });
        }
        return;
      }

      await self.registration.showNotification(data.title || "YASL", {
        body: data.body || "Liste wurde aktualisiert",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: data.listId ? `yasl-list-${data.listId}` : "yasl-list",
        renotify: true,
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client && typeof client.navigate === "function") {
            try {
              await client.navigate(targetUrl);
              return;
            } catch {
              /* fall through */
            }
          }
          client.postMessage({
            type: "yasl-navigate",
            url: targetUrl,
          });
          return;
        }
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
