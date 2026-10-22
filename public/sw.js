const CACHE = "offline-v1";
const OFFLINE_URL = "/offline";

// The offline page is useless without its own CSS/JS, so those hashed assets are cached with it.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const response = await fetch(OFFLINE_URL, { cache: "reload" });
      if (!response.ok) throw new Error("offline page unavailable");
      await cache.put(OFFLINE_URL, response.clone());
      const html = await response.text();
      const assets = new Set(html.match(/\/_next\/static\/[^"'\\\s)]+/g));
      await Promise.all(
        [...assets].map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== CACHE)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL, { cacheName: CACHE }),
      ),
    );
    return;
  }

  if (new URL(request.url).pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches
        .match(request, { cacheName: CACHE })
        .then((hit) => hit ?? fetch(request)),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, href } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { href },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/today";
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const existing = windows[0];
      if (existing) {
        await existing.focus();
        // navigate() rejects for windows this worker doesn't control yet.
        if (await existing.navigate(href).catch(() => null)) return;
      }
      await self.clients.openWindow(href);
    })(),
  );
});
