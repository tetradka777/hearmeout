import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as friendScores from './useFriendScores';
import { setJsonCacheOwner } from './cachedJson';

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>(done => { resolve = done; });
  return { promise, resolve };
}

test('friend scores request profiles only and publish each result without waiting for slower friends', async t => {
  assert.equal(typeof friendScores.subscribeFriendScores, 'function');
  setJsonCacheOwner('friend-scores-test');
  t.after(() => setJsonCacheOwner(null));
  const slow = deferredResponse();
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return url.endsWith('/slow') ? slow.promise : Response.json({ genres: [{ g: 'rock', pct: 100 }] });
  });
  const seen: unknown[] = [];
  const stop = friendScores.subscribeFriendScores([{ g: 'rock', pct: 100 }], ['fast', 'slow'], (id, score) => seen.push([id, score]));
  t.after(stop);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(urls.sort(), ['/api/users/fast', '/api/users/slow']);
  assert.deepEqual(seen, [['fast', { pct: 100 }]]);
  slow.resolve(Response.json({ genres: [{ g: 'pop', pct: 100 }] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [['fast', { pct: 100 }], ['slow', { pct: 0 }]]);
});

test('cancelled friend-score requests cannot publish into a different account or friend selection', async t => {
  assert.equal(typeof friendScores.subscribeFriendScores, 'function');
  setJsonCacheOwner('old-score-account');
  t.after(() => setJsonCacheOwner(null));
  const pending = deferredResponse();
  t.mock.method(globalThis, 'fetch', () => pending.promise);
  const seen: unknown[] = [];
  const stop = friendScores.subscribeFriendScores([{ g: 'rock', pct: 100 }], ['friend'], (id, score) => seen.push([id, score]));
  stop();
  setJsonCacheOwner('new-score-account');
  pending.resolve(Response.json({ genres: [{ g: 'rock', pct: 100 }] }));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, []);
});

test('denied profiles and profiles without listening data keep the existing null percentage', async t => {
  assert.equal(typeof friendScores.subscribeFriendScores, 'function');
  setJsonCacheOwner('score-privacy-test');
  t.after(() => setJsonCacheOwner(null));
  t.mock.method(globalThis, 'fetch', async (url: string) => url.endsWith('/denied')
    ? new Response('', { status: 403 }) : Response.json({ genres: [] }));
  const seen: unknown[] = [];
  const stop = friendScores.subscribeFriendScores([{ g: 'rock', pct: 100 }], ['denied', 'empty'], (id, score) => seen.push([id, score]));
  t.after(stop);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen.sort(), [['denied', { pct: null }], ['empty', { pct: null }]]);
});
