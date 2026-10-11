'use client';

import { useEffect } from 'react';

// Registers public/sw.js (offline page, push notifications). Production
// only: in development a service worker would get in the way of reloads.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  return null;
}
