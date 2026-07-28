/**
 * The client-side half of background sync (docs/ROADMAP.md Phase 14) - an
 * IndexedDB-backed outbox for a reply sent while offline. `apps/web/public/sw.js`
 * is the other half (it owns the actual replay-on-reconnect logic); this
 * module only enqueues and asks the SW to flush, matching the "queue
 * visibly, never a silent failure" requirement in docs/UI_GUIDE.md Section 15.
 */

const OUTBOX_DB = "smc-outbox";
const OUTBOX_STORE = "queued-replies";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(OUTBOX_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(OUTBOX_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface QueuedRequest {
  id: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export async function enqueueRequest(item: QueuedRequest): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readwrite");
    tx.objectStore(OUTBOX_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  // Prefer Background Sync (Chromium) - the SW replays the queue as soon as
  // connectivity genuinely returns, even if this tab is closed. Safari/
  // Firefox don't implement it, so registration.sync is undefined there;
  // the 'online' event listener below is the fallback for those browsers.
  const registration = await navigator.serviceWorker.ready;
  const syncCapable = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
  if (syncCapable.sync) {
    await syncCapable.sync.register("smc-outbox-sync");
  }
}

export async function queuedCount(): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, "readonly");
    const req = tx.objectStore(OUTBOX_STORE).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The Background-Sync-unsupported fallback: ask the active service worker to flush the outbox whenever the browser reports 'online'. Call this once at app startup. */
export function registerOnlineFlushFallback(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("online", () => {
    navigator.serviceWorker.ready.then((registration) => {
      registration.active?.postMessage({ type: "FLUSH_OUTBOX" });
    });
  });
}
