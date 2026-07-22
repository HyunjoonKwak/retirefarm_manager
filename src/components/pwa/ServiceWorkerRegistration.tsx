"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      // Register service worker
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("[PWA] Service Worker registration failed:", error);
      });
    }
  }, []);

  return null;
}
