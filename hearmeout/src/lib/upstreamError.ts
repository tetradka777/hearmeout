import { NextResponse } from 'next/server';

// Spotify (and other upstream APIs) answered 429. retryAfter is in seconds,
// from the upstream Retry-After header when it sent one.
export class RateLimitError extends Error {
  constructor(public retryAfter: number) {
    super('rate_limited');
  }
}

// Seconds from a Retry-After header (delta-seconds or an HTTP date).
export function retryAfterSeconds(res: Response, fallback = 30): number {
  const h = res.headers.get('retry-after');
  if (!h) return fallback;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(1, Math.ceil(n));
  const at = Date.parse(h);
  return Number.isFinite(at) ? Math.max(1, Math.ceil((at - Date.now()) / 1000)) : fallback;
}

// The JSON error an API route returns when an upstream call failed: never
// the internal message (it names upstream paths); a rate limit becomes 503
// with Retry-After so the client can show "try again in a moment".
export function upstreamErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof RateLimitError) {
    return NextResponse.json({ error: 'rate_limited', retryAfter: err.retryAfter }, { status: 503, headers: { 'Retry-After': String(err.retryAfter) } });
  }
  console.error(`${where}:`, err);
  return NextResponse.json({ error: 'upstream_error' }, { status: 502 });
}
