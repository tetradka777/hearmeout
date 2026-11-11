import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { getSpotifyAppToken } from './spotifyAppAuth';

// Each test advances past the previous token's lifetime. Only the HTTP
// boundary and clock are replaced; no credentials or live services are used.
let testTime = 0;
function clock(t: TestContext) {
  testTime += 86400_000;
  let now = testTime;
  t.mock.method(Date, 'now', () => now);
  return (elapsed: number) => { now += elapsed; };
}

test('parallel cold token callers share one HTTP request', async (t) => {
  clock(t);
  let release!: () => void;
  const ready = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    await ready;
    return Response.json({ access_token: 'cold-token', expires_in: 3600 });
  });
  const requests = Array.from({ length: 6 }, () => getSpotifyAppToken());
  const observedCalls = calls;
  release();
  // Complete all waiters even when checking the old implementation.
  assert.deepEqual(await Promise.all(requests), Array(6).fill('cold-token'));
  assert.equal(observedCalls, 1);
});

test('a fresh token is reused without another HTTP request', async (t) => {
  clock(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ access_token: 'reused-token', expires_in: 3600 });
  });
  assert.equal(await getSpotifyAppToken(), 'reused-token');
  assert.equal(await getSpotifyAppToken(), 'reused-token');
  assert.equal(calls, 1);
});

test('HTTP token errors reach every waiter and allow a later retry', async (t) => {
  clock(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return calls === 1 ? new Response(null, { status: 503 })
      : Response.json({ access_token: 'retried-token', expires_in: 3600 });
  });
  const results = await Promise.allSettled([getSpotifyAppToken(), getSpotifyAppToken()]);
  assert.deepEqual(results.map((result) => result.status), ['rejected', 'rejected']);
  for (const result of results) {
    if (result.status === 'rejected') assert.match(String(result.reason), /Spotify app token request failed: 503/);
  }
  assert.equal(calls, 1);
  assert.equal(await getSpotifyAppToken(), 'retried-token');
  assert.equal(calls, 2);
});

test('a network token error does not prevent a later retry', async (t) => {
  clock(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    if (++calls === 1) throw new Error('test connection failure');
    return Response.json({ access_token: 'recovered-token', expires_in: 3600 });
  });
  await assert.rejects(getSpotifyAppToken(), /test connection failure/);
  assert.equal(await getSpotifyAppToken(), 'recovered-token');
  assert.equal(calls, 2);
});

test('tokens refresh once at the existing 30-second expiry margin', async (t) => {
  const advance = clock(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return Response.json({ access_token: `expiry-token-${calls}`, expires_in: 3600 });
  });
  assert.equal(await getSpotifyAppToken(), 'expiry-token-1');
  advance(3570_000 - 1);
  assert.equal(await getSpotifyAppToken(), 'expiry-token-1');
  assert.equal(calls, 1);
  advance(1);
  assert.deepEqual(await Promise.all([getSpotifyAppToken(), getSpotifyAppToken()]), ['expiry-token-2', 'expiry-token-2']);
  assert.equal(calls, 2);
});
