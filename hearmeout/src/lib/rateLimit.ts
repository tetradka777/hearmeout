import type { NextRequest } from 'next/server';

// Small in-memory rate limits for the auth routes (the server is one
// long-lived process on Render). Without them a password could be guessed
// without limit, and since every sign-in reaches Supabase from this one
// server, a guessing run would also trip Supabase's per-IP limit and block
// sign-in for everybody.
const hits = new Map<string, number[]>();

// True while `key` is under `max` hits in the last `windowMs`.
export function underLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  return recent.length < max;
}

export function hit(key: string): void {
  const list = hits.get(key) || [];
  list.push(Date.now());
  hits.set(key, list);
}

// The visitor's address: Render puts the client first in X-Forwarded-For.
export function clientIp(request: NextRequest): string {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}
