/* Nourish service worker: offline shell, last-seen pages, web push. */
const VERSION = "nourish-v1";
const SHELL = ["/offline", "/img/hero.jpg", "/icons/192"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // never cache API data

  // Static assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/img/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/barcode/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: network-first, fall back to the last copy (read-only offline view of today / shopping list)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/offline"))),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = { title: "Nourish", body: "", url: "/" };
  try {
    data = Object.assign(data, e.data ? e.data.json() : {});
  } catch {
    data.body = e.data ? e.data.text() : "";
  }
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(data.title, { body: data.body, tag: data.tag, data: { url: data.url }, icon: "/icons/192", badge: "/icons/192" }),
      typeof data.badge === "number" && self.navigator.setAppBadge ? self.navigator.setAppBadge(data.badge).catch(() => {}) : Promise.resolve(),
    ]),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          c.navigate(url).catch(() => {});
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
