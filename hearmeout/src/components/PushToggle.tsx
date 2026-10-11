'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/lib/AppContext';

// Settings → Notifications on this device (lib/push, public/sw.js). The
// switch asks for permission, subscribes this browser with the server's
// VAPID key and saves the subscription; off unsubscribes. A line under it
// explains when it can't work: unsupported browser, notifications blocked,
// push not set up on the server, or an iPhone that hasn't added the site
// to the Home Screen (iOS only allows push for installed web apps).
type Status = 'checking' | 'off' | 'on' | 'busy' | 'unsupported' | 'ios' | 'denied' | 'unavailable';

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js');
}

export function PushToggle() {
  const { t, language, showToast } = useApp();
  const [status, setStatus] = useState<Status>('checking');
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      if (!supported) { if (!cancelled) setStatus(ios && !standalone ? 'ios' : 'unsupported'); return; }
      const cfg = await fetch('/api/push').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      if (cancelled) return;
      if (!cfg?.configured || !cfg.publicKey) { setStatus('unavailable'); return; }
      setPublicKey(cfg.publicKey);
      if (Notification.permission === 'denied') { setStatus('denied'); return; }
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (!cancelled) setStatus(sub ? 'on' : 'off');
    })();
    return () => { cancelled = true; };
  }, []);

  const turnOn = async () => {
    if (!publicKey) return;
    setStatus('busy');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setStatus(permission === 'denied' ? 'denied' : 'off'); return; }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON(), language }) });
      if (!res.ok) { await sub.unsubscribe().catch(() => {}); setStatus('unavailable'); return; }
      setStatus('on');
      showToast(t('settings.notificationsOn'));
    } catch {
      setStatus('off');
    }
  };

  const turnOff = async () => {
    setStatus('busy');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch('/api/push', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
    } finally {
      setStatus('off');
    }
  };

  const note = status === 'ios' ? t('settings.notificationsIos')
    : status === 'unsupported' ? t('settings.notificationsUnsupported')
    : status === 'denied' ? t('settings.notificationsBlocked')
    : status === 'unavailable' ? t('settings.notificationsUnavailable')
    : t('settings.notificationsHint');
  const on = status === 'on';
  const usable = status === 'on' || status === 'off';
  return (
    <div className="setrow">
      <div><b>{t('settings.notifications')}</b><small className="muted">{note}</small></div>
      <button className="sw" role="switch" aria-checked={on} aria-label={t('settings.notifications')} disabled={!usable} onClick={() => (on ? turnOff() : turnOn())}><i /></button>
    </div>
  );
}
