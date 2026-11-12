'use client';

import { useEffect } from 'react';
import { useApp } from './AppContext';
import { cachedJson, peekJson } from './cachedJson';
import type { FeedResponse } from './types';

// The ticker needs the same feed on every screen. Fetching it here keeps
// deep links independent of Home's recap, friends and album shelves.
export function useSharedFeed(): void {
  const { me, setFeed } = useApp();
  const url = `/api/feed?tz=${new Date().getTimezoneOffset()}`;

  useEffect(() => {
    let cancelled = false;
    // Account-owned storage is switched before `me` changes. Clear the old
    // account's feed when the new account has no stored answer yet.
    setFeed(me ? peekJson<FeedResponse>(url) : null);
    if (!me) return;
    void cachedJson<FeedResponse>(url).then(data => {
      if (!cancelled && data) setFeed(data);
    });
    return () => { cancelled = true; };
  }, [me, setFeed, url]);
}
