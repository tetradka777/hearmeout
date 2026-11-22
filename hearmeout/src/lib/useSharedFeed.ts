'use client';

import { useEffect } from 'react';
import { useApp } from './AppContext';
import { cachedJson, peekJson } from './cachedJson';
import type { FeedResponse } from './types';

// The ticker needs the same feed on every screen. Fetching it here keeps
// deep links independent of Home's recap, friends and album shelves.
export function useSharedFeed(): void {
  const { me, setFeed } = useApp();
  const userId = me?.id;
  const url = `/api/feed?tz=${new Date().getTimezoneOffset()}`;

  useEffect(() => {
    let cancelled = false;
    // Account-owned storage is switched before `me` changes. Clear the old
    // account's feed when the new account has no stored answer yet.
    setFeed(userId ? peekJson<FeedResponse>(url) : null);
    if (!userId) return;
    let last = 0;
    const refresh = () => {
      if (document.hidden || Date.now() - last < 30000) return;
      last = Date.now();
      void cachedJson<FeedResponse>(url).then(data => { if (!cancelled && data) setFeed(data); });
    };
    refresh();
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = setInterval(() => { if (!peekJson<FeedResponse>(url)) refresh(); }, 60000);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener('online', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [me, userId, setFeed, url]);
}
