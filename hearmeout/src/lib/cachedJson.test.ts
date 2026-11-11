import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cachedJson, cachedPage, peekJson, setJsonCacheOwner, storeJson } from './cachedJson';

function pendingResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

test('a previous account request cannot populate or return data after the account changes', async (t) => {
  const old = pendingResponse();
  t.mock.method(globalThis, 'fetch', () => old.promise);
  setJsonCacheOwner('old-account');
  const result = cachedJson('/api/private-account');
  setJsonCacheOwner('new-account');
  storeJson('/api/private-account', { name: 'new' });
  old.resolve(Response.json({ name: 'old' }));
  assert.equal(await result, null);
  assert.deepEqual(peekJson('/api/private-account'), { name: 'new' });
  setJsonCacheOwner(null);
});

test('completing an old account request cannot remove the new account request being shared', async (t) => {
  const old = pendingResponse();
  const current = pendingResponse();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => (++calls === 1 ? old.promise : current.promise));
  setJsonCacheOwner('old-account');
  const first = cachedJson('/api/account-inflight');
  setJsonCacheOwner('new-account');
  const second = cachedJson('/api/account-inflight');
  old.resolve(Response.json({ name: 'old' }));
  await first;
  assert.equal(cachedJson('/api/account-inflight'), second);
  assert.equal(calls, 2);
  current.resolve(Response.json({ name: 'new' }));
  assert.deepEqual(await second, { name: 'new' });
  setJsonCacheOwner(null);
});

test('the latest forced refresh wins when network responses arrive out of order', async (t) => {
  const old = pendingResponse();
  const fresh = pendingResponse();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', () => (++calls === 1 ? old.promise : fresh.promise));
  setJsonCacheOwner('refresh-account');
  const first = cachedJson('/api/refresh');
  const second = cachedJson('/api/refresh', { force: true });
  fresh.resolve(Response.json({ version: 2 }));
  await second;
  old.resolve(Response.json({ version: 1 }));
  await first;
  assert.deepEqual(peekJson('/api/refresh'), { version: 2 });
  setJsonCacheOwner(null);
});

test('sign-out prevents an outstanding answer from restoring private data', async (t) => {
  const pending = pendingResponse();
  t.mock.method(globalThis, 'fetch', () => pending.promise);
  setJsonCacheOwner('signed-out-account');
  const result = cachedJson('/api/after-signout');
  setJsonCacheOwner(null);
  pending.resolve(Response.json({ private: true }));
  assert.equal(await result, null);
  assert.equal(peekJson('/api/after-signout'), null);
});

test('a failed refresh preserves the current account copy', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  setJsonCacheOwner('offline-account');
  storeJson('/api/offline-copy', { saved: true });
  assert.deepEqual(await cachedJson('/api/offline-copy', { force: true }), { saved: true });
  setJsonCacheOwner(null);
});

test('two stale shelf readers share a single background refresh',async(t)=>{
 let now=10000;t.mock.method(Date,'now',()=>now);setJsonCacheOwner('shelf-account');storeJson('/api/shelf-old',{version:1});now+=7200000;
 const response=pendingResponse();let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;return response.promise;});
 const copies=await Promise.all([cachedPage('/api/shelf-old'),cachedPage('/api/shelf-old')]);response.resolve(Response.json({version:2}));await new Promise(r=>setImmediate(r));
 assert.deepEqual(copies,[{version:1},{version:1}]);assert.equal(calls,1);assert.deepEqual(peekJson('/api/shelf-old'),{version:2});setJsonCacheOwner(null);
});
