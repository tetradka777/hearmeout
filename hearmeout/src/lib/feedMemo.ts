import type { FeedResponse } from '@/lib/types';

// The whole /api/feed answer per viewer and time zone, kept for 15 s (and
// one request at a time): Home, the ticker and the background preloader all
// ask for it around the same moment. Cleared when the viewer rates.
const MEMO_MS = 15000;
const memo = new Map<string, { at: number; body: Promise<FeedResponse> }>();

export function memoFeed(userId: string, tzMin: number, build: () => Promise<FeedResponse>): Promise<FeedResponse> {
  const key = `${userId}:${tzMin}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.body;
  const body = build();
  body.catch(() => memo.delete(key));
  memo.set(key, { at: Date.now(), body });
  if (memo.size > 2000) memo.delete(memo.keys().next().value!);
  return body;
}

export function forgetFeed(userId: string): void {
  for (const k of [...memo.keys()]) if (k.startsWith(userId + ':')) memo.delete(k);
}
