import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { cachedJson, cachedPage, invalidateJson, peekJson, setJsonCacheOwner, storeJson } from './cachedJson';

test('persistence yields to idle time and cancelled account writes cannot restore storage', async t => {
  const values = new Map<string, string>();
  let idle: (() => void) | undefined;
  let cancelled = 0;
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (i: number) => [...values.keys()][i] ?? null,
    get length() { return values.size; },
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    localStorage, requestIdleCallback: (callback: () => void) => { idle = callback; return 1; },
    cancelIdleCallback: () => cancelled++,
  } });
  t.after(() => { setJsonCacheOwner(null); if (original) Object.defineProperty(globalThis, 'window', original); else Reflect.deleteProperty(globalThis, 'window'); });
  setJsonCacheOwner('idle-account');
  storeJson('/api/ordinary', { title: 'quoted " title' });
  storeJson('/api/me', { id: 'idle-account', bannerUrl: 'x'.repeat(700_000) });
  storeJson('/api/oversized-ordinary', { text: 'x'.repeat(700_000) });
  await new Promise(resolve => setTimeout(resolve, 1600));
  assert.equal(values.has('hmo-json-v1:idle-account'), false);
  assert.ok(idle);
  idle();
  assert.deepEqual(JSON.parse(values.get('hmo-json-v1:idle-account')!)['/api/ordinary'].data, { title: 'quoted " title' });
  const saved = JSON.parse(values.get('hmo-json-v1:idle-account')!);
  assert.equal(saved['/api/me'].data.bannerUrl.length, 700_000);
  assert.equal(saved['/api/oversized-ordinary'], undefined);
  assert.ok(values.get('hmo-json-v1:idle-account')!.length <= 3_000_000);
  storeJson('/api/ordinary', { title: 'private old account' });
  await new Promise(resolve => setTimeout(resolve, 1600));
  const oldWrite = idle!;
  setJsonCacheOwner('another-account');
  assert.equal(cancelled, 1);
  oldWrite();
  assert.equal(values.has('hmo-json-v1:idle-account'), false);
  assert.equal(values.has('hmo-json-v1:another-account'), false);
});

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

test('sensitive reads revalidate fresh cache and discard denied answers', async (t) => {
  setJsonCacheOwner('sensitive-account');
  const url = '/api/diary?from=0&userId=friend';
  storeJson(url, { entries: ['old memory'] });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('', { status: 403 }); });
  assert.equal(await cachedJson(url, { sensitive: true }), null);
  assert.equal(calls, 1);
  assert.equal(peekJson(url), null);
  setJsonCacheOwner(null);
});

test('sensitive reads do not return old content when access cannot be validated', async (t) => {
  setJsonCacheOwner('sensitive-offline-account');
  const url = '/api/diary?from=0&userId=friend';
  storeJson(url, { entries: ['old memory'] });
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 503 }));
  assert.equal(await cachedJson(url, { sensitive: true }), null);
  setJsonCacheOwner(null);
});

test('denial on a diary page evicts sibling pages and prevents late sibling restoration', async (t) => {
  setJsonCacheOwner('sensitive-pages-account');
  const first = '/api/diary?from=0&userId=friend';
  const more = '/api/diary?from=20&userId=friend';
  storeJson(first, { entries: ['first page'] });
  const pending = pendingResponse();
  t.mock.method(globalThis, 'fetch', (url: string | URL | Request) => String(url) === first ? pending.promise : Promise.resolve(new Response('', { status: 401 })));
  const old = cachedJson(first, { force: true, sensitive: true });
  assert.equal(await cachedJson(more, { sensitive: true }), null);
  assert.equal(peekJson(first), null);
  pending.resolve(Response.json({ entries: ['late private memory'] }));
  assert.equal(await old, null);
  assert.equal(peekJson(first), null);
  setJsonCacheOwner(null);
});

test('diary mutation invalidation prevents an old page from repopulating fresh cache', async (t) => {
  setJsonCacheOwner('diary-mutation-account');
  const pending = pendingResponse();
  t.mock.method(globalThis, 'fetch', () => pending.promise);
  const url = '/api/diary?from=20';
  const request = cachedJson(url);
  invalidateJson('/api/diary');
  pending.resolve(Response.json({ entries: ['deleted memory'] }));
  assert.equal(await request, null);
  assert.equal(peekJson(url), null);
  setJsonCacheOwner(null);
});

test('diary cache is removed from restored storage and never persisted again', async (t) => {
  const values = new Map<string, string>([['hmo-json-v1:diary-storage-account', JSON.stringify({
    '/api/diary?from=0': { at: Date.now(), data: { private: true } },
    '/api/ordinary': { at: Date.now(), data: { preserved: true } },
  })]]);
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage } });
  t.after(() => { if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else Reflect.deleteProperty(globalThis, 'window'); });
  setJsonCacheOwner('diary-storage-account');
  assert.equal(peekJson('/api/diary?from=0'), null);
  assert.deepEqual(peekJson('/api/ordinary'), { preserved: true });
  assert.equal(values.get('hmo-json-v1:diary-storage-account')!.includes('/api/diary'), false);
  storeJson('/api/diary?summary=1', { total: 1 });
  await new Promise((resolve) => setTimeout(resolve, 1600));
  assert.equal(values.get('hmo-json-v1:diary-storage-account')!.includes('/api/diary'), false);
  setJsonCacheOwner(null);
});

test('two stale shelf readers share a single background refresh',async(t)=>{
 let now=10000;t.mock.method(Date,'now',()=>now);setJsonCacheOwner('shelf-account');storeJson('/api/shelf-old',{version:1});now+=7200000;
 const response=pendingResponse();let calls=0;t.mock.method(globalThis,'fetch',()=>{calls++;return response.promise;});
 const copies=await Promise.all([cachedPage('/api/shelf-old'),cachedPage('/api/shelf-old')]);response.resolve(Response.json({version:2}));await new Promise(r=>setImmediate(r));
 assert.deepEqual(copies,[{version:1},{version:1}]);assert.equal(calls,1);assert.deepEqual(peekJson('/api/shelf-old'),{version:2});setJsonCacheOwner(null);
});

test('a late swap GET cannot overwrite an authoritative mutation result', async(t)=>{
 setJsonCacheOwner('swap-mutation-account');const response=pendingResponse();t.mock.method(globalThis,'fetch',()=>response.promise);
 const url='/api/album-swaps?id=test';const pending=cachedJson(url);
 invalidateJson('/api/album-swaps');storeJson(url,{completed:true});response.resolve(Response.json({completed:false}));
 assert.deepEqual(await pending,{completed:true});assert.deepEqual(peekJson(url),{completed:true});setJsonCacheOwner(null);
});
