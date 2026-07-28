"use client";

import { useEffect } from "react";
import { registerOnlineFlushFallback } from "../lib/offline-queue";

/**
 * Registers public/sw.js on mount (docs/ROADMAP.md Phase 14) - a real
 * effect, not decoration: this is what turns on the offline shell,
 * background sync, and Web Push for the rest of the app. Mounted once in
 * app/layout.tsx, renders nothing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration can fail in dev over plain HTTP on some browsers, or
      // in an environment without SW support at all - the app must keep
      // working without it (PRODUCT.md's "never load-bearing" principle,
      // applied here to the PWA layer the same way it's applied to AI).
    });
    registerOnlineFlushFallback();
  }, []);

  return null;
}
