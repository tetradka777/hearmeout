'use client';

import { useEffect } from 'react';
import { loadedStaticAssetUrls } from '@/lib/staticAssetWarmup';

// Registers public/sw.js (offline page, public build assets, push). Production
// only: in development a service worker would get in the way of reloads.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    let alive = true;
    let idle: number | null = null;
    let timer: number | null = null;
    const ready = navigator.serviceWorker.register('/sw.js')
      .then(() => navigator.serviceWorker.ready).catch(() => null);

    const warm = () => {
      const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
      if (!alive || !navigator.onLine || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '')) return;
      void ready.then((registration) => {
        if (!alive || !registration) return;
        const urls = loadedStaticAssetUrls(performance.getEntriesByType('resource').map((entry) => entry.name), location.origin);
        const worker = navigator.serviceWorker.controller ?? registration.active;
        if (urls.length) worker?.postMessage({ type: 'WARM_STATIC', urls });
      }).catch(() => {}); // An updating worker can disappear before the message.
    };
    const scheduleWarmup = () => {
      if (!alive) return;
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(warm, { timeout: 3000 });
      else timer = window.setTimeout(warm, 1500);
    };
    if (document.readyState === 'complete') scheduleWarmup();
    else window.addEventListener('load', scheduleWarmup, { once: true });
    return () => {
      alive = false;
      window.removeEventListener('load', scheduleWarmup);
      if (idle != null) window.cancelIdleCallback(idle);
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);
  return null;
}
