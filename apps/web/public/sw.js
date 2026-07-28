/**
 * Service worker (docs/ROADMAP.md Phase 14) - hand-written, no
 * next-pwa/workbox dependency (none was already installed, and adding a
 * build-time-bundled caching framework is a bigger commitment than this
 * phase's scope needs - a vanilla SW covers the three real requirements:
 * offline app shell, background sync for offline-queued replies, and Web
 * Push). Disclosed limitation: this is best-effort runtime caching (cache
 * what's actually been visited), not a versioned precache of every build
 * asset - a real workbox/next-pwa setup would handle Next's hashed bundle
 * filenames more robustly across deploys. See docs/reviews/phase-14-review.md.
 */

const SHELL_CACHE = "smc-shell-v1";
const OUTBOX_DB = "smc-outbox";
const OUTBOX_STORE = "queued-replies";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.add("/")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// --- Offline shell: cache-then-network for same-origin GETs, never for API calls. ---
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never intercept cross-origin calls (apps/api runs on its own origin/port) -
  // serving stale API data as if it were live would violate this product's
  // own "never show a misleading state" principle (the same reasoning
  // behind Inbox.tsx's conversationsError fix from the MVP Hardening pass).
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || caches.match("/"));
      return cached || networkFetch;
    }),
  );
});

// --- Background sync: replay queued outbound replies once connectivity returns. ---
function openOutboxDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function flushOutbox() {
  const db = await openOutboxDb();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: "POST",
        headers: item.headers,
        body: item.body,
      });
      if (res.ok) {
        const db2 = await openOutboxDb();
        const tx = db2.transaction(OUTBOX_STORE, "readwrite");
        tx.objectStore(OUTBOX_STORE).delete(item.id);
      }
      // A non-ok response (e.g. still-expired auth) leaves the item queued for the next sync/online event rather than dropping it silently.
    } catch {
      // Still offline or the request failed - leave it queued, try again next time.
      break;
    }
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === "smc-outbox-sync") {
    event.waitUntil(flushOutbox());
  }
});

// Background Sync isn't supported in every browser (Safari/Firefox) - the
// client also listens for the 'online' event as a fallback (lib/offline-queue.ts),
// and this message handler lets that fallback path trigger the same flush logic.
self.addEventListener("message", (event) => {
  if (event.data?.type === "FLUSH_OUTBOX") {
    event.waitUntil(flushOutbox());
  }
});

// --- Web Push: show a real OS/browser notification, matching the same priority framing the in-app toast already uses. ---
self.addEventListener("push", (event) => {
  let payload = { title: "Smart Message Center", body: "You have a new notification." };
  try {
    if (event.data) payload = event.data.json();
  } catch {
    // Non-JSON push payload - fall back to the generic message above rather than failing to show anything.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192",
      badge: "/icon-192",
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      const existing = clients.find((c) => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return self.clients.openWindow(targetUrl);
    }),
  );
});
